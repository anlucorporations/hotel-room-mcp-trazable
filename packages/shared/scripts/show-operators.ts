import { closeDbPool, getDbPool } from "../src/index";
import { decryptTotpSecret } from "../src/auth/crypto";

/**
 * Muestra los **operadores del sistema** con todo lo que es recuperable y nada más.
 *
 * Lo que SI se puede recuperar:
 *   - usuario, rol, estado y bloqueo;
 *   - la **semilla TOTP**, porque esta CIFRADA (AES-256-GCM con `AES_SECRET_KEY`), no hasheada:
 *     se descifra y se reconstruye el `otpauth://` para darla de alta en el autenticador;
 *   - si tiene codigos de rescate sin usar.
 *
 * Lo que NO se puede recuperar:
 *   - la **contrasena**: en la base solo vive su hash bcrypt. Si se pierde, se rota con
 *     `pnpm --filter @hotel/shared provision:admin`, que imprime una nueva una sola vez.
 *
 * Uso: `node --env-file=../../.env --import tsx scripts/show-operators.ts`
 */
const pool = getDbPool();

const operators = await pool.query<{
  username: string;
  role: string;
  active: boolean;
  locked_until: Date | null;
  failed_attempts: number;
  totp_secret_enc: string;
  created_at: Date;
}>(
  `SELECT username, role, active, locked_until, failed_attempts, totp_secret_enc, created_at
     FROM admin_users
    ORDER BY role, username`,
);

for (const row of operators.rows) {
  const recovery = await pool.query<{ total: number; used: number }>(
    `SELECT COUNT(*)::INT AS total, COUNT(*) FILTER (WHERE used)::INT AS used
       FROM mfa_recovery_codes WHERE username = $1`,
    [row.username],
  );

  let seed = "(no se pudo descifrar: cambio AES_SECRET_KEY?)";
  try {
    seed = decryptTotpSecret(row.totp_secret_enc);
  } catch {
    // La semilla esta cifrada con la clave del entorno actual; si cambio, es irrecuperable.
  }

  const locked =
    row.locked_until && row.locked_until.getTime() > Date.now()
      ? ` · BLOQUEADO hasta ${row.locked_until.toISOString()}`
      : "";

  console.log("=".repeat(78));
  console.log(`  USUARIO      : ${row.username}`);
  console.log(`  ROL          : ${row.role}`);
  console.log(`  ESTADO       : ${row.active ? "activo" : "INACTIVO"}${locked}`);
  console.log("  CONTRASENA   : (hash bcrypt; no es recuperable - se rota con provision:admin)");
  console.log(`  SEMILLA TOTP : ${seed}`);
  if (!seed.startsWith("(")) {
    console.log(
      `  ALTA TOTP    : otpauth://totp/HotelMarinaDelSol:${encodeURIComponent(row.username)}?secret=${seed}&issuer=HotelMarinaDelSol`,
    );
  }
  const total = recovery.rows[0]?.total ?? 0;
  const used = recovery.rows[0]?.used ?? 0;
  console.log(`  RESCATE      : ${total} codigos, ${total - used} sin usar`);
  console.log(`  ALTA         : ${row.created_at.toISOString()}`);
}

console.log("=".repeat(78));
console.log(`Operadores: ${operators.rowCount}`);

await closeDbPool();
