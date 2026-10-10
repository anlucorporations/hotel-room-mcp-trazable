import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de **auditoría de operadores** (`operator_audit_log`, RNF-M-19 · D-C21 · D-C31).
 *
 * Es la traza legal del mantenimiento y del ama de llaves: **append-only** y con **hash encadenado**,
 * de modo que nadie —ni un operador con acceso a la base— pueda reescribir el pasado sin que se note.
 *
 * Tres decisiones que conviene no deshacer:
 *
 *   1. **Solo se añade.** El repositorio no expone `update` ni `delete`, y la base lo impone de verdad
 *      con el trigger `trg_operator_audit_append_only` (F1). Un `DELETE` masivo sin desactivar el
 *      trigger revienta: el plan de reset lo hace de forma explícita y transaccional.
 *   2. **La cadena se cierra con un cerrojo de aviso** (`pg_advisory_xact_lock`): dos operadores
 *      auditando a la vez leerían el mismo `prev_hash` y la cadena quedaría bifurcada. El cerrojo se
 *      toma dentro de la transacción, así que se libera solo, incluso si algo falla.
 *   3. **El hash es determinista**: SHA-256 sobre `prev_hash|JSON canónico` (claves ordenadas). Sin el
 *      orden canónico, el mismo contenido daría hashes distintos y `verifyChain` no serviría para
 *      detectar manipulaciones.
 *
 * `verifyChain()` recorre la cadena entera y devuelve el primer eslabón roto: es la comprobación que
 * hace la exportación (CU-V-40) y la que permite demostrar que la traza no se tocó.
 */

/** Cerrojo de la cadena de auditoría (constante del proyecto: 4 letras «AUDT» en hex). */
const AUDIT_CHAIN_LOCK_KEY = 0x41554454;

/** Campos de una entrada de auditoría. */
export interface AuditEntryInput {
  readonly actorUsername: string;
  readonly actorRole: string;
  /** Vocabulario canónico de `operations-state.ts` (p. ej. `ROOM_BLOCK`, `INSPECTION`). */
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly action: string;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly terminalId?: string | null;
}

export interface AuditEntryRecord {
  readonly id: string;
  readonly actorUsername: string;
  readonly actorRole: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly action: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly terminalId: string | null;
  readonly prevHash: string | null;
  readonly integrityHash: string;
  readonly createdAt: Date;
}

export interface AuditListOptions {
  readonly limit?: number;
  readonly entityType?: string;
  readonly entityId?: string;
}

export interface ChainVerification {
  /** `true` si toda la cadena cuadra. */
  readonly ok: boolean;
  /** Entradas comprobadas. */
  readonly checked: number;
  /** Id de la primera entrada manipulada, si la hay. */
  readonly brokenAt?: string;
  /** Motivo legible del primer eslabón roto. */
  readonly reason?: string;
}

interface AuditRow extends QueryResultRow {
  id: string;
  actor_username: string;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_value: unknown;
  new_value: unknown;
  terminal_id: string | null;
  prev_hash: string | null;
  integrity_hash: string;
  created_at: Date;
}

function mapRow(row: AuditRow): AuditEntryRecord {
  return {
    id: row.id,
    actorUsername: row.actor_username,
    actorRole: row.actor_role,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    oldValue: row.old_value,
    newValue: row.new_value,
    terminalId: row.terminal_id,
    prevHash: row.prev_hash,
    integrityHash: row.integrity_hash,
    createdAt: row.created_at,
  };
}

/** JSON con claves ordenadas en profundidad: el mismo contenido debe dar SIEMPRE el mismo texto. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Hash del eslabón: `0x` + SHA-256 de `prev_hash|contexto|contenido`. Se exporta porque la
 * verificación externa (una auditoría, un script de exportación) debe poder recalcularlo sin tocar la
 * base de datos.
 */
export function computeIntegrityHash(prevHash: string | null, content: unknown): string {
  const digest = createHash("sha256")
    .update(`${prevHash ?? ""}|${canonicalJson(content)}`)
    .digest("hex");
  return `0x${digest}`;
}

/** Contenido que se firma en el hash: lo que identifica la acción, sin el hash ni la fecha de inserción. */
function hashableContent(entry: AuditEntryInput): Record<string, unknown> {
  return {
    actorUsername: entry.actorUsername,
    actorRole: entry.actorRole,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    action: entry.action,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    terminalId: entry.terminalId ?? null,
  };
}

export class AuditRepository {
  private readonly pool: Pool;

  constructor(pool: Pool = getDbPool()) {
    this.pool = pool;
  }

  /**
   * Añade una entrada y devuelve la fila guardada, **encadenada** con la anterior.
   *
   * El cerrojo de aviso serializa las inserciones concurrentes; sin él, dos auditorías simultáneas
   * leerían el mismo `prev_hash` y la cadena se bifurcaría (y `verifyChain` lo detectaría después, en
   * producción y sin poder repararlo).
   */
  async append(entry: AuditEntryInput): Promise<AuditEntryRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_CHAIN_LOCK_KEY]);

      const head = await client.query<{ integrity_hash: string }>(
        `SELECT integrity_hash FROM operator_audit_log
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
      );
      const prevHash = head.rows[0]?.integrity_hash ?? null;
      const integrityHash = computeIntegrityHash(prevHash, hashableContent(entry));

      const inserted = await client.query<AuditRow>(
        `INSERT INTO operator_audit_log
           (actor_username, actor_role, entity_type, entity_id, action,
            old_value, new_value, terminal_id, prev_hash, integrity_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          entry.actorUsername,
          entry.actorRole,
          entry.entityType,
          entry.entityId ?? null,
          entry.action,
          entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
          entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
          entry.terminalId ?? null,
          prevHash,
          integrityHash,
        ],
      );

      await client.query("COMMIT");
      return mapRow(inserted.rows[0]!);
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Últimas entradas (para la exportación y el panel de administración). */
  async list(options: AuditListOptions = {}): Promise<AuditEntryRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1_000);
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (options.entityType !== undefined) {
      values.push(options.entityType);
      conditions.push(`entity_type = $${values.length}`);
    }
    if (options.entityId !== undefined) {
      values.push(options.entityId);
      conditions.push(`entity_id = $${values.length}`);
    }
    values.push(limit);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query<AuditRow>(
      `SELECT * FROM operator_audit_log ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${values.length}`,
      values,
    );
    return rows.map(mapRow);
  }

  /**
   * Verifica la cadena completa: recalcula cada hash y comprueba que cada `prev_hash` apunta al
   * eslabón anterior. Devuelve el primer punto roto en vez de lanzar, porque quien audita necesita
   * justamente el detalle de **dónde** se rompió.
   */
  async verifyChain(): Promise<ChainVerification> {
    const { rows } = await this.pool.query<AuditRow>(
      `SELECT * FROM operator_audit_log ORDER BY created_at ASC, id ASC`,
    );

    let previous: string | null = null;
    for (const [index, row] of rows.entries()) {
      const record = mapRow(row);
      if (record.prevHash !== previous) {
        return {
          ok: false,
          checked: index,
          brokenAt: record.id,
          reason: `prev_hash ${record.prevHash ?? "null"} no apunta al eslabón anterior ${previous ?? "null"}`,
        };
      }
      const expected = computeIntegrityHash(record.prevHash, {
        actorUsername: record.actorUsername,
        actorRole: record.actorRole,
        entityType: record.entityType,
        entityId: record.entityId,
        action: record.action,
        oldValue: record.oldValue,
        newValue: record.newValue,
        terminalId: record.terminalId,
      });
      if (expected !== record.integrityHash) {
        return {
          ok: false,
          checked: index,
          brokenAt: record.id,
          reason: "integrity_hash no corresponde al contenido guardado",
        };
      }
      previous = record.integrityHash;
    }

    return { ok: true, checked: rows.length };
  }
}

/** `ROLLBACK` defensivo: si la conexión ya murió, no se enmascara el error original. */
async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // El error que importa es el original.
  }
}
