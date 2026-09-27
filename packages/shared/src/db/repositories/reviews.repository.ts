import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de **reseñas** (F6 · D-27, D-28, D-58, D-59).
 *
 * Ciclo de vida: el titular de una noche **consumida** (`CHECKED_OUT`) envía su reseña firmada con
 * EIP-712 (D-59); nace **`PENDING`** y el administrador la **aprueba o rechaza con motivo** (D-58).
 * Solo las `APPROVED` se publican en la home. Las reseñas son **anónimas**: se publica la nota, el
 * comentario y el **tipo** de habitación, **nunca** el número exacto ni datos del huésped (RNF-30).
 */

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export const REVIEW_STATUSES: readonly ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export interface ReviewRecord {
  id: string;
  roomType: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: Date;
  moderatedBy: string | null;
  moderatedAt: Date | null;
  moderationNotes: string | null;
}

export interface ReviewsSummary {
  average: number | null;
  count: number;
}

export interface CreateReviewInput {
  tokenId: string;
  roomType: string;
  roomId?: string | null;
  rating: number;
  comment?: string | null;
}

export type ReviewErrorCode = "ALREADY_REVIEWED";

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Columnas que se exponen al cliente (sin `token_id` ni `room_id`: la reseña es anónima). */
const REVIEW_COLUMNS =
  "id, room_type, rating, comment, status, created_at, moderated_by, moderated_at, moderation_notes";

export class ReviewsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Reseñas publicables (D-58: solo las `APPROVED`), de la más reciente a la más antigua. **No**
   * expone `token_id` ni `room_id`: la reseña es anónima.
   */
  async listApproved(limit = 12): Promise<ReviewRecord[]> {
    const res = await this.pool.query(
      `SELECT ${REVIEW_COLUMNS}
         FROM reviews
        WHERE status = 'APPROVED'
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapReview);
  }

  /** Nota media y número de reseñas aprobadas; media `null` si todavía no hay ninguna. */
  async summary(): Promise<ReviewsSummary> {
    const res = await this.pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 2) AS average, COUNT(*)::int AS count
         FROM reviews WHERE status = 'APPROVED'`,
    );
    const row = res.rows[0] ?? {};
    const average = row.average === null || row.average === undefined ? null : Number(row.average);
    return { average, count: Number(row.count ?? 0) };
  }

  /** Reseñas por estado (moderación, D-58). Lista vacía si no hay. */
  async listByStatus(status: ReviewStatus, limit = 50): Promise<ReviewRecord[]> {
    const res = await this.pool.query(
      `SELECT ${REVIEW_COLUMNS}
         FROM reviews
        WHERE status = $1
        ORDER BY created_at ASC
        LIMIT $2`,
      [status, limit],
    );
    return res.rows.map(mapReview);
  }

  async findByToken(tokenId: string): Promise<ReviewRecord | null> {
    const res = await this.pool.query(
      `SELECT ${REVIEW_COLUMNS} FROM reviews WHERE token_id = $1`,
      [tokenId],
    );
    return res.rows.length > 0 ? mapReview(res.rows[0]) : null;
  }

  /**
   * Alta de una reseña: nace **`PENDING`** (D-58). El índice único de `token_id` garantiza **una
   * reseña por noche**: un segundo intento se traduce a error de negocio en lugar de fila duplicada.
   */
  async create(input: CreateReviewInput): Promise<ReviewRecord> {
    try {
      const res = await this.pool.query(
        `INSERT INTO reviews (token_id, room_type, room_id, rating, comment, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING ${REVIEW_COLUMNS}`,
        [
          input.tokenId,
          input.roomType,
          input.roomId ?? null,
          input.rating,
          input.comment?.trim() || null,
        ],
      );
      return mapReview(res.rows[0]);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ReviewError("ALREADY_REVIEWED", "Esta noche ya tiene una reseña enviada.");
      }
      throw error;
    }
  }

  /**
   * Modera una reseña pendiente (D-58): la aprueba o la rechaza dejando **quién**, **cuándo** y el
   * **motivo**. Solo actúa sobre `PENDING`; devuelve `null` si no existe o ya estaba moderada.
   */
  async moderate(
    id: string,
    status: Extract<ReviewStatus, "APPROVED" | "REJECTED">,
    moderator: string,
    notes?: string | null,
  ): Promise<ReviewRecord | null> {
    const res = await this.pool.query(
      `UPDATE reviews
          SET status = $2, moderated_by = $3, moderated_at = NOW(), moderation_notes = $4
        WHERE id = $1 AND status = 'PENDING'
        RETURNING ${REVIEW_COLUMNS}`,
      [id, status, moderator, notes?.trim() || null],
    );
    return res.rows.length > 0 ? mapReview(res.rows[0]) : null;
  }
}

function mapReview(row: QueryResultRow): ReviewRecord {
  return {
    id: row.id as string,
    roomType: row.room_type as string,
    rating: Number(row.rating),
    comment: (row.comment as string | null) ?? null,
    status: row.status as ReviewStatus,
    createdAt: row.created_at as Date,
    moderatedBy: (row.moderated_by as string | null) ?? null,
    moderatedAt: (row.moderated_at as Date | null) ?? null,
    moderationNotes: (row.moderation_notes as string | null) ?? null,
  };
}
