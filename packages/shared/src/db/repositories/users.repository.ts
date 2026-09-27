import type { Pool, QueryResultRow } from "pg";
import type { BackOfficeRoleName } from "../../domain/roles";
import { getDbPool } from "../pool";

/**
 * Rol de back-office que puede ostentar un operador en la base de datos (D-04, D-56).
 *
 * Es un alias del tipo isomorfo `BackOfficeRoleName` (definido en `domain/roles`), de modo que los
 * componentes de cliente puedan tipar el rol sin importar el barril raíz del paquete. `HOUSEKEEPING`
 * y `MAINTENANCE` son roles **de BD sin wallet** (D-56): no existen en el contrato (`RoleName`).
 */
export type AdminUserRole = BackOfficeRoleName;

/** Registro de operador tal y como vive en `admin_users`. */
export interface AdminUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  /** Semilla TOTP **cifrada** con AES-256-GCM (`AES_SECRET_KEY`); nunca en claro. */
  totpSecretEnc: string;
  role: AdminUserRole;
  active: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Alta o actualización de un operador (el hash y la semilla llegan ya cifrados/hasheados). */
export interface UpsertAdminUserInput {
  username: string;
  passwordHash: string;
  totpSecretEnc: string;
  role: AdminUserRole;
  active?: boolean;
}

/** Resultado de registrar un intento fallido de autenticación. */
export interface FailedAttemptResult {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/**
 * Repositorio de operadores del back-office (tabla `admin_users`, D-04).
 *
 * Los secretos NO se manejan aquí en claro: el llamante entrega el hash bcrypt y la semilla
 * TOTP ya cifrada con AES-256-GCM. Así el repositorio es agnóstico del material criptográfico
 * y se puede probar con `pg` mockeado, igual que el resto de repositorios del proyecto.
 */
export class UsersRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /** Busca un operador por nombre de usuario (comparación exacta, índice único). */
  async findByUsername(username: string): Promise<AdminUserRecord | null> {
    const res = await this.pool.query("SELECT * FROM admin_users WHERE username = $1", [username]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  /**
   * Lista TODOS los operadores, activos e inactivos (Sistemas → Usuarios, RF-42).
   *
   * Devuelve el registro completo, pero la API de Sistemas **nunca** expone `passwordHash` ni
   * `totpSecretEnc`: la vista pública de la lista los descarta (RNF-41).
   */
  async listAll(): Promise<AdminUserRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM admin_users ORDER BY active DESC, username ASC",
    );
    return res.rows.map((row) => this.mapRow(row));
  }

  /**
   * Crea o actualiza un operador.
   *
   * Al actualizar se reinician `failed_attempts` y `locked_until`: el aprovisionamiento deja la
   * cuenta en un estado utilizable (si no, un operador bloqueado seguiría bloqueado tras un
   * cambio de credenciales legítimo).
   */
  async upsert(input: UpsertAdminUserInput): Promise<AdminUserRecord> {
    const res = await this.pool.query(
      `INSERT INTO admin_users (username, password_hash, totp_secret_enc, role, active, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, TRUE), NOW())
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         totp_secret_enc = EXCLUDED.totp_secret_enc,
         role = EXCLUDED.role,
         active = EXCLUDED.active,
         failed_attempts = 0,
         locked_until = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        input.username,
        input.passwordHash,
        input.totpSecretEnc,
        input.role,
        input.active === undefined ? null : input.active,
      ],
    );
    return this.mapRow(res.rows[0]);
  }

  /** Rota la semilla TOTP de un operador (usada por `/api/auth/mfa/setup`). */
  async updateTotpSecretEnc(username: string, totpSecretEnc: string): Promise<void> {
    await this.pool.query(
      "UPDATE admin_users SET totp_secret_enc = $2, updated_at = NOW() WHERE username = $1",
      [username, totpSecretEnc],
    );
  }

  async updatePasswordHash(username: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE admin_users SET password_hash = $2, updated_at = NOW() WHERE username = $1",
      [username, passwordHash],
    );
  }

  async setActive(username: string, active: boolean): Promise<void> {
    await this.pool.query(
      "UPDATE admin_users SET active = $2, updated_at = NOW() WHERE username = $1",
      [username, active],
    );
  }

  /**
   * Registra un intento fallido de forma ATÓMICA: el incremento y el bloqueo temporal se
   * resuelven en una sola sentencia, de modo que dos intentos concurrentes no pueden perder
   * incrementos (el antiguo contador en memoria sí podía).
   *
   * Si el contador alcanza `maxAttempts`, fija `locked_until = NOW() + lockSeconds` y reinicia
   * el contador: al expirar el bloqueo el operador recupera intentos en lugar de quedar
   * bloqueado para siempre. `maxAttempts` por defecto 5 y ventana 15 min (D-04).
   */
  async registerFailedAttempt(
    username: string,
    maxAttempts = 5,
    lockSeconds = 900,
  ): Promise<FailedAttemptResult> {
    const res = await this.pool.query(
      `UPDATE admin_users
       SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
           locked_until = CASE
             WHEN failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' seconds')::INTERVAL
             ELSE locked_until
           END,
           updated_at = NOW()
       WHERE username = $1
       RETURNING failed_attempts, locked_until`,
      [username, maxAttempts, lockSeconds],
    );

    if (res.rows.length === 0) {
      return { failedAttempts: 0, lockedUntil: null };
    }
    return {
      failedAttempts: Number(res.rows[0].failed_attempts) || 0,
      lockedUntil: res.rows[0].locked_until ?? null,
    };
  }

  /** Reinicia el contador de fallos y libera el bloqueo temporal (login correcto). */
  async resetFailedAttempts(username: string): Promise<void> {
    await this.pool.query(
      `UPDATE admin_users
       SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE username = $1`,
      [username],
    );
  }

  /**
   * ¿Sigue bloqueada la cuenta? El bloqueo es temporal: si `locked_until` ya pasó se considera
   * desbloqueada (y el contador ya se reinició al fijar el bloqueo).
   */
  isLocked(user: Pick<AdminUserRecord, "lockedUntil">, now: Date = new Date()): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
  }

  // ── Códigos de rescate (tabla `mfa_recovery_codes`) ──────────────────────────────────────

  /**
   * Reemplaza los códigos de rescate del operador por los nuevos (los antiguos dejan de ser
   * válidos: la rotación de semilla TOTP invalida los códigos emitidos con ella).
   */
  async replaceRecoveryCodes(username: string, hashedCodes: readonly string[]): Promise<void> {
    await this.pool.query("DELETE FROM mfa_recovery_codes WHERE username = $1", [username]);
    for (const codeHash of hashedCodes) {
      await this.pool.query(
        "INSERT INTO mfa_recovery_codes (username, code_hash) VALUES ($1, $2)",
        [username, codeHash],
      );
    }
  }

  /** Número de códigos de rescate aún sin usar. */
  async countRemainingRecoveryCodes(username: string): Promise<number> {
    const res = await this.pool.query(
      "SELECT COUNT(*)::INT as count FROM mfa_recovery_codes WHERE username = $1 AND used = FALSE",
      [username],
    );
    return Number(res.rows[0]?.count) || 0;
  }

  /**
   * Consume un código de rescate de UN SOLO USO.
   *
   * El `UPDATE ... WHERE used = FALSE RETURNING id` es la operación que decide: si dos
   * peticiones intentan canjear el mismo código a la vez, solo una obtiene fila y la otra
   * recibe `false`. La comparación bcrypt se hace en memoria contra los hashes candidatos
   * (no hay forma de indexar bcrypt en SQL), pero el consumo nunca es doble.
   */
  async consumeRecoveryCode(
    username: string,
    plainCode: string,
    compareFn: (plain: string, hash: string) => Promise<boolean>,
  ): Promise<boolean> {
    const res = await this.pool.query(
      "SELECT id, code_hash FROM mfa_recovery_codes WHERE username = $1 AND used = FALSE",
      [username],
    );

    for (const row of res.rows) {
      const match = await compareFn(plainCode, row.code_hash);
      if (!match) continue;

      const consumed = await this.pool.query(
        `UPDATE mfa_recovery_codes SET used = TRUE, used_at = NOW()
         WHERE id = $1 AND used = FALSE
         RETURNING id`,
        [row.id],
      );
      return (consumed.rowCount ?? 0) > 0;
    }

    return false;
  }

  /** Invalida todos los códigos de rescate (p. ej. al desactivar al operador). */
  async invalidateRecoveryCodes(username: string): Promise<void> {
    await this.pool.query(
      "UPDATE mfa_recovery_codes SET used = TRUE, used_at = NOW() WHERE username = $1 AND used = FALSE",
      [username],
    );
  }

  private mapRow(row: QueryResultRow): AdminUserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      totpSecretEnc: row.totp_secret_enc,
      role: row.role,
      active: row.active,
      failedAttempts: Number(row.failed_attempts) || 0,
      lockedUntil: row.locked_until ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
