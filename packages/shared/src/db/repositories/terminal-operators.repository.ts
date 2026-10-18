import type { Pool, QueryResultRow } from "pg";
import { TERMINAL_BACK_OFFICE_ROLE_NAMES } from "../../domain/roles";
import { getDbPool } from "../pool";

/**
 * Repositorio de **operarios de terminal** (`terminal_operators`) — vNext · F1 · T1.10 (D-C17, D-C42).
 *
 * Son los operarios que trabajan en un terminal fijo **sin wallet**: técnicos de mantenimiento y
 * camareras. No firman on-chain; se autentican con un **PIN corto** (aquí solo llega el hash, nunca
 * el PIN en claro) y su ciclo de vida es «alta → rotación de PIN → bloqueo / baja».
 *
 * Decisiones que conviene no deshacer:
 *
 *   1. **`role` usa el vocabulario único de `domain/roles`**: `TERMINAL_BACK_OFFICE_ROLE_NAMES`
 *      (`MAINTENANCE_TECH`, `HOUSEKEEPER`). El `CHECK` de la tabla repite esa lista; no se inventan
 *      roles nuevos aquí ni en la base.
 *   2. **El bloqueo por intentos fallidos es atómico**: `registerFailedAttempt` incrementa y bloquea
 *      en una **sola sentencia** (`failed_attempts + 1` leído dentro del propio `UPDATE`). Con dos
 *      sentencias, dos intentos concurrentes podrían leer el mismo contador y el 5.º PIN erróneo
 *      pasaría sin bloquear.
 *   3. **`unlock`/`resetFailedAttempts` y `changePin` limpian el bloqueo**: un PIN rotado por el
 *      administrador deja la cuenta utilizable (`locked_until = NULL`, `failed_attempts = 0`); si no,
 *      un operario legítimamente desbloqueado seguiría fuera.
 *   4. **La baja es lógica** (`active = FALSE`): el histórico de terminales y auditoría no se pierde.
 */

/** Roles admitidos en `terminal_operators.role` (CHECK del esquema, vocabulario de `domain/roles`). */
export type TerminalOperatorRole = (typeof TERMINAL_BACK_OFFICE_ROLE_NAMES)[number];

/** Códigos de error estables: la ruta HTTP los traduce a un 4xx/5xx concreto. */
export type TerminalOperatorsErrorCode = "USERNAME_TAKEN" | "INVALID_ROLE" | "NOT_FOUND";

/** Error con código estable del repositorio de operarios de terminal. */
export class TerminalOperatorsError extends Error {
  constructor(
    readonly code: TerminalOperatorsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TerminalOperatorsError";
  }
}

/** Registro de operario tal y como vive en `terminal_operators` (columnas en camelCase). */
export interface TerminalOperatorRecord {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly role: TerminalOperatorRole;
  readonly pinHash: string;
  readonly pinChangedAt: Date | null;
  readonly mustChangePin: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly active: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Alta de un operario de terminal (el `pinHash` llega ya derivado; el PIN nunca se guarda en claro). */
export interface CreateTerminalOperatorInput {
  readonly username: string;
  readonly fullName: string;
  readonly role: TerminalOperatorRole;
  readonly pinHash: string;
  readonly createdBy: string;
}

/** Rotación de PIN. `mustChangePin` se deja en `false`: el PIN lo fijó el administrador. */
export interface ChangePinInput {
  readonly pinHash: string;
  readonly mustChangePin?: boolean;
}

/** Umbrales del bloqueo por intentos fallidos (por defecto: 5 intentos → 15 minutos). */
export interface RegisterFailedAttemptOptions {
  readonly maxAttempts?: number;
  readonly lockMinutes?: number;
}

/** Filtros de `list`. */
export interface TerminalOperatorListOptions {
  readonly role?: TerminalOperatorRole;
  readonly active?: boolean;
}

/** Resultado de un intento fallido: el operario actualizado y si el contador lo dejó bloqueado. */
export interface RegisterFailedAttemptResult {
  readonly operator: TerminalOperatorRecord;
  readonly locked: boolean;
}

interface TerminalOperatorRow extends QueryResultRow {
  id: string;
  username: string;
  full_name: string;
  role: TerminalOperatorRole;
  pin_hash: string;
  pin_changed_at: Date | null;
  must_change_pin: boolean;
  failed_attempts: number;
  locked_until: Date | null;
  active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

function mapOperator(row: TerminalOperatorRow): TerminalOperatorRecord {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    pinHash: row.pin_hash,
    pinChangedAt: row.pin_changed_at,
    mustChangePin: row.must_change_pin,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function notFound(id: string): TerminalOperatorsError {
  return new TerminalOperatorsError("NOT_FOUND", `El operario de terminal ${id} no existe.`);
}

export class TerminalOperatorsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Alta de un operario. El `username` es único en la base: si ya existe, Postgres devuelve `23505`
   * y se traduce a `USERNAME_TAKEN` (un error de dominio, no un 500).
   */
  async create(input: CreateTerminalOperatorInput): Promise<TerminalOperatorRecord> {
    if (!(TERMINAL_BACK_OFFICE_ROLE_NAMES as readonly string[]).includes(input.role)) {
      throw new TerminalOperatorsError(
        "INVALID_ROLE",
        `Rol de terminal no admitido: ${String(input.role)}.`,
      );
    }
    try {
      const { rows } = await this.pool.query<TerminalOperatorRow>(
        `INSERT INTO terminal_operators
           (username, full_name, role, pin_hash, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.username, input.fullName, input.role, input.pinHash, input.createdBy],
      );
      return mapOperator(rows[0]!);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new TerminalOperatorsError(
          "USERNAME_TAKEN",
          `El nombre de usuario ${input.username} ya está en uso.`,
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<TerminalOperatorRecord | null> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `SELECT * FROM terminal_operators WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapOperator(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<TerminalOperatorRecord | null> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `SELECT * FROM terminal_operators WHERE username = $1`,
      [username],
    );
    return rows[0] ? mapOperator(rows[0]) : null;
  }

  /** Lista operarios, opcionalmente filtrados por rol y/o estado; orden estable por nombre. */
  async list(options: TerminalOperatorListOptions = {}): Promise<TerminalOperatorRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (options.role !== undefined) {
      values.push(options.role);
      conditions.push(`role = $${values.length}`);
    }
    if (options.active !== undefined) {
      values.push(options.active);
      conditions.push(`active = $${values.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `SELECT * FROM terminal_operators ${where}
        ORDER BY full_name ASC, username ASC`,
      values,
    );
    return rows.map(mapOperator);
  }

  /**
   * Rotación de PIN: fija el hash nuevo, sella `pin_changed_at`, ajusta `must_change_pin` y **limpia**
   * el bloqueo (un PIN rotado por el administrador debe poder usarse).
   */
  async changePin(id: string, input: ChangePinInput): Promise<TerminalOperatorRecord> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `UPDATE terminal_operators
          SET pin_hash = $2,
              pin_changed_at = NOW(),
              must_change_pin = $3,
              failed_attempts = 0,
              locked_until = NULL,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, input.pinHash, input.mustChangePin ?? false],
    );
    if (!rows[0]) throw notFound(id);
    return mapOperator(rows[0]);
  }

  /**
   * Registra un intento fallido de PIN en **una sola sentencia atómica**: incrementa el contador y,
   * si con este intento se alcanza `maxAttempts`, fija `locked_until = NOW() + lockMinutes`.
   *
   * `locked` se calcula comparando el `locked_until` devuelto con el reloj local: un bloqueo ya
   * caducado (`locked_until` en el pasado) no cuenta como bloqueo activo.
   */
  async registerFailedAttempt(
    id: string,
    options: RegisterFailedAttemptOptions = {},
  ): Promise<RegisterFailedAttemptResult> {
    const maxAttempts = options.maxAttempts ?? 5;
    const lockMinutes = options.lockMinutes ?? 15;
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `UPDATE terminal_operators
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE
                WHEN failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
                ELSE locked_until
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, maxAttempts, lockMinutes],
    );
    if (!rows[0]) throw notFound(id);
    const operator = mapOperator(rows[0]);
    return {
      operator,
      locked: operator.lockedUntil !== null && operator.lockedUntil.getTime() > Date.now(),
    };
  }

  /** Deja el contador a cero y retira el bloqueo (tras un PIN correcto). */
  async resetFailedAttempts(id: string): Promise<TerminalOperatorRecord> {
    return this.clearLock(id);
  }

  /** Desbloqueo explícito por el administrador (`failed_attempts = 0`, `locked_until = NULL`). */
  async unlock(id: string): Promise<TerminalOperatorRecord> {
    return this.clearLock(id);
  }

  private async clearLock(id: string): Promise<TerminalOperatorRecord> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `UPDATE terminal_operators
          SET failed_attempts = 0,
              locked_until = NULL,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (!rows[0]) throw notFound(id);
    return mapOperator(rows[0]);
  }

  /** Baja lógica (`active = FALSE`) o reactivación (`active = TRUE`). */
  async setActive(id: string, active: boolean): Promise<TerminalOperatorRecord> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `UPDATE terminal_operators
          SET active = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, active],
    );
    if (!rows[0]) throw notFound(id);
    return mapOperator(rows[0]);
  }

  /** Operarios con el bloqueo vigente ahora mismo (`locked_until > NOW()`). */
  async listLocked(): Promise<TerminalOperatorRecord[]> {
    const { rows } = await this.pool.query<TerminalOperatorRow>(
      `SELECT * FROM terminal_operators
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
        ORDER BY full_name ASC, username ASC`,
    );
    return rows.map(mapOperator);
  }

  /**
   * Criterio de bloqueo: `locked_until IS NOT NULL AND locked_until > NOW()`.
   *
   * Devuelve `false` para un id inexistente (un operario que no existe no puede estar bloqueado; el
   * llamante lo tratará como credencial inválida igual).
   */
  async isLocked(id: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ locked: boolean } & QueryResultRow>(
      `SELECT (locked_until IS NOT NULL AND locked_until > NOW()) AS locked
         FROM terminal_operators
        WHERE id = $1`,
      [id],
    );
    return rows[0]?.locked === true;
  }
}
