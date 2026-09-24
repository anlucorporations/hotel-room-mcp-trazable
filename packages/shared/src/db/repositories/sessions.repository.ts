import type { Pool } from "pg";
import { getDbPool } from "../pool";
import { hashSessionTrace } from "../../auth/crypto";

export interface AdminSessionRecord {
  id: string;
  username: string;
  role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE";
  refreshTokenHash: string;
  /**
   * Traza pseudonimizada (`hmac-sha256:…`) de la IP del acceso, o `null` si no había nada que
   * guardar. **Nunca** es la IP en claro (ADR-24). El `rate limiting` no usa este campo.
   */
  ipAddress: string | null;
  /** Traza pseudonimizada del *user agent*, con el mismo criterio que `ipAddress`. */
  userAgent: string | null;
  revoked: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export class SessionsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Crea la sesión guardando la traza **pseudonimizada** (ADR-24): la IP y el *user agent* se pasan
   * por `hashSessionTrace` (HMAC-SHA256 con clave) antes de tocar la base de datos. Se hace aquí, en
   * el único punto de escritura, para que ningún llamante pueda saltárselo por descuido.
   */
  async createSession(
    username: string,
    role: "DEFAULT_ADMIN_ROLE" | "RECEPTION_ROLE",
    refreshTokenHash: string,
    ipAddress: string,
    userAgent: string,
    expiresAt: Date,
  ): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO admin_sessions (username, role, refresh_token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        username,
        role,
        refreshTokenHash,
        hashSessionTrace(ipAddress),
        hashSessionTrace(userAgent),
        expiresAt,
      ],
    );
    return res.rows[0].id;
  }

  async getSessionByHash(refreshTokenHash: string): Promise<AdminSessionRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM admin_sessions 
       WHERE refresh_token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
      [refreshTokenHash],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      refreshTokenHash: row.refresh_token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      revoked: row.revoked,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query("UPDATE admin_sessions SET revoked = TRUE WHERE id = $1", [sessionId]);
  }

  async revokeSessionByHash(refreshTokenHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE admin_sessions SET revoked = TRUE WHERE refresh_token_hash = $1",
      [refreshTokenHash],
    );
  }

  async revokeAllUserSessions(username: string): Promise<void> {
    await this.pool.query("UPDATE admin_sessions SET revoked = TRUE WHERE username = $1", [
      username,
    ]);
  }

  async saveRecoveryCodes(username: string, hashedCodes: string[]): Promise<void> {
    // Elimina códigos previos antes de persistir los nuevos
    await this.pool.query("DELETE FROM mfa_recovery_codes WHERE username = $1", [username]);
    for (const codeHash of hashedCodes) {
      await this.pool.query(
        "INSERT INTO mfa_recovery_codes (username, code_hash) VALUES ($1, $2)",
        [username, codeHash],
      );
    }
  }

  async getRemainingRecoveryCodesCount(username: string): Promise<number> {
    const res = await this.pool.query(
      "SELECT COUNT(*)::INT as count FROM mfa_recovery_codes WHERE username = $1 AND used = FALSE",
      [username],
    );
    return res.rows[0]?.count ?? 0;
  }

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
      if (match) {
        await this.pool.query(
          "UPDATE mfa_recovery_codes SET used = TRUE, used_at = NOW() WHERE id = $1",
          [row.id],
        );
        return true;
      }
    }

    return false;
  }
}
