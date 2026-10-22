import type { Pool } from "pg";
import { getDbPool } from "../pool";

/**
 * Outbox de **publicación con minteo on-chain** (2026-10-21, D-85).
 *
 * Publicar desde el back-office (unitario o masivo) ya no escribe la publicación en la base ni
 * cambia el estado a `PUBLISHED`: deja un job `PENDING` en `room_mint_jobs`. El worker relayer:
 *
 *   1. registra la habitación en `HotelNights` si falta (`registerRoom`, DEFAULT_ADMIN);
 *   2. ancla la huella de la ficha (`publishRoom`, DEFAULT_ADMIN);
 *   3. mintea la **primera noche** de la ventana (`mint`, MINTER).
 *
 * Solo cuando las tres confirman se registra la publicación y se pone la habitación `PUBLISHED`.
 * Si algo falla, la habitación **sigue en DRAFT** y el job queda `FAILED` con el motivo (decisión
 * del responsable, 2026-10-21): no se publica nada que no esté minteado on-chain.
 *
 * El índice único parcial `idx_room_mint_jobs_active` garantiza un solo job activo por habitación;
 * `enqueue` es idempotente y devuelve el job activo existente si ya había uno.
 */

/** Estados del outbox de publicación. */
export type RoomMintJobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

/** Fila de `room_mint_jobs`. */
export interface RoomMintJobRecord {
  id: string;
  roomId: string;
  status: RoomMintJobStatus;
  attempts: number;
  /** Fecha seleccionada (AAAA-MM-DD) para publicar SOLO esa noche; `null` = primera noche. */
  targetDate: string | null;
  contentHash: string;
  signature: string | null;
  signerAddress: string | null;
  publishedBy: string;
  registerTxHash: string | null;
  publishTxHash: string | null;
  mintTxHash: string | null;
  tokenId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** Datos para encolar una publicación. */
export interface EnqueueRoomMintJobInput {
  roomId: string;
  /** Fecha seleccionada en el tablero (AAAA-MM-DD). Si falta, se mintea la primera noche. */
  targetDate?: string | null;
  contentHash: string;
  signature?: string | null;
  signerAddress?: string | null;
  publishedBy: string;
}

/** Resultado de la ejecución on-chain que el worker guarda al completar. */
export interface CompleteRoomMintJobInput {
  registerTxHash: string | null;
  publishTxHash: string;
  mintTxHash: string | null;
  tokenId: string | null;
}

/** `DATE` de PostgreSQL (JS `Date` local) → `AAAA-MM-DD`, o `null`. */
function isoDay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

/** Mapea la fila de PostgreSQL al registro de dominio. */
function mapJob(row: Record<string, unknown>): RoomMintJobRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    status: row.status as RoomMintJobStatus,
    attempts: row.attempts as number,
    targetDate: isoDay(row.target_date),
    contentHash: row.content_hash as string,
    signature: (row.signature as string | null) ?? null,
    signerAddress: (row.signer_address as string | null) ?? null,
    publishedBy: row.published_by as string,
    registerTxHash: (row.register_tx_hash as string | null) ?? null,
    publishTxHash: (row.publish_tx_hash as string | null) ?? null,
    mintTxHash: (row.mint_tx_hash as string | null) ?? null,
    tokenId: (row.token_id as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
  };
}

/** Repositorio del outbox `room_mint_jobs`. */
export class RoomMintJobsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Encola una publicación. **Idempotente**: si ya hay un job activo para la habitación devuelve
   * ese mismo (no duplica registro ni minteo). Si el job activo anterior falló, crea uno nuevo.
   */
  async enqueue(input: EnqueueRoomMintJobInput): Promise<RoomMintJobRecord> {
    const res = await this.pool.query(
      `INSERT INTO room_mint_jobs (room_id, target_date, content_hash, signature, signer_address, published_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (room_id) WHERE status IN ('PENDING', 'RUNNING') DO NOTHING
       RETURNING *`,
      [
        input.roomId,
        input.targetDate ?? null,
        input.contentHash,
        input.signature ?? null,
        input.signerAddress ?? null,
        input.publishedBy,
      ],
    );
    if (res.rows.length > 0) return mapJob(res.rows[0]);

    const existing = await this.pool.query(
      `SELECT * FROM room_mint_jobs
        WHERE room_id = $1 AND status IN ('PENDING', 'RUNNING')
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.roomId],
    );
    if (existing.rows.length === 0) {
      throw new Error("no se pudo encolar la publicación: el job activo desapareció");
    }
    const job = mapJob(existing.rows[0]);
    // Un job activo para OTRA fecha no sirve: la publicación quedaría en la noche equivocada.
    if ((input.targetDate ?? null) !== job.targetDate) {
      throw new Error(
        `ya hay una publicación en curso para esta habitación en ${job.targetDate ?? "la primera noche"}; espera a que termine`,
      );
    }
    return job;
  }

  /**
   * Reclama el siguiente job pendiente y lo pasa a `RUNNING` en una sola sentencia
   * (`FOR UPDATE SKIP LOCKED`): varias instancias del worker no procesan el mismo job.
   */
  async claimNext(): Promise<RoomMintJobRecord | null> {
    const res = await this.pool.query(
      `UPDATE room_mint_jobs
          SET status = 'RUNNING', attempts = attempts + 1, updated_at = NOW()
        WHERE id = (
          SELECT id FROM room_mint_jobs
           WHERE status = 'PENDING'
           ORDER BY created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
    );
    return res.rows.length > 0 ? mapJob(res.rows[0]) : null;
  }

  /** Marca el job como completado con el rastro on-chain real. */
  async complete(id: string, input: CompleteRoomMintJobInput): Promise<RoomMintJobRecord | null> {
    const res = await this.pool.query(
      `UPDATE room_mint_jobs
          SET status = 'DONE',
              register_tx_hash = $2,
              publish_tx_hash = $3,
              mint_tx_hash = $4,
              token_id = $5,
              last_error = NULL,
              updated_at = NOW(),
              completed_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, input.registerTxHash, input.publishTxHash, input.mintTxHash, input.tokenId],
    );
    return res.rows.length > 0 ? mapJob(res.rows[0]) : null;
  }

  /** Marca el job como fallido. La habitación se queda en `DRAFT` (no se publica). */
  async fail(id: string, reason: string): Promise<RoomMintJobRecord | null> {
    const res = await this.pool.query(
      `UPDATE room_mint_jobs
          SET status = 'FAILED',
              last_error = $2,
              updated_at = NOW(),
              completed_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, reason.slice(0, 2000)],
    );
    return res.rows.length > 0 ? mapJob(res.rows[0]) : null;
  }

  /** Job activo de una habitación (`PENDING`/`RUNNING`), si lo hay. */
  async findActiveByRoom(roomId: string): Promise<RoomMintJobRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM room_mint_jobs
        WHERE room_id = $1 AND status IN ('PENDING', 'RUNNING')
        ORDER BY created_at DESC
        LIMIT 1`,
      [roomId],
    );
    return res.rows.length > 0 ? mapJob(res.rows[0]) : null;
  }

  /** Último job de una habitación (para mostrar el error de la última publicación fallida). */
  async findLatestByRoom(roomId: string): Promise<RoomMintJobRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM room_mint_jobs WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [roomId],
    );
    return res.rows.length > 0 ? mapJob(res.rows[0]) : null;
  }

  /** Habitaciones con job activo (el listado del back-office marca «publicación en curso»). */
  async listActiveRoomIds(): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT room_id FROM room_mint_jobs WHERE status IN ('PENDING', 'RUNNING')`,
    );
    return res.rows.map((row) => row.room_id as string);
  }

  /**
   * Último job por habitación (mapa `roomId → job`). Lo usa el listado del back-office para marcar
   * «publicación en curso» y mostrar el motivo si la última publicación falló (decisión: no se
   * publica nada que no esté minteado).
   */
  async listLatestByRooms(roomIds: readonly string[]): Promise<Map<string, RoomMintJobRecord>> {
    if (roomIds.length === 0) return new Map();
    const res = await this.pool.query(
      `SELECT DISTINCT ON (room_id) *
         FROM room_mint_jobs
        WHERE room_id = ANY($1::uuid[])
        ORDER BY room_id, created_at DESC`,
      [roomIds],
    );
    return new Map(res.rows.map((row) => [row.room_id as string, mapJob(row)]));
  }
}
