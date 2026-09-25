/**
 * Aprovisionamiento de operadores del back-office (D-04).
 *
 * Crea o ACTUALIZA un usuario de administración/recepción con una contraseña y una semilla
 * TOTP NUEVAS, y entrega al operador el `otpauth://` (para el autenticador) y los códigos de
 * rescate de un solo uso. Es la única vía por la que esos datos salen en claro: en la base solo
 * quedan el hash bcrypt y la semilla cifrada con AES-256-GCM (`AES_SECRET_KEY`).
 *
 * Uso:
 *   pnpm --filter @hotel/shared provision:admin -- --username admin@hotel.es --role DEFAULT_ADMIN_ROLE
 *   pnpm --filter @hotel/shared provision:admin -- --username recepcion@hotel.es --role RECEPTION_ROLE --password '<clave>'
 *
 * Si no se pasa `--password`, se genera una aleatoria fuerte y se imprime. Nunca se escribe la
 * contraseña ni la semilla en ficheros ni en logs persistentes.
 */
import { parseArgs } from "node:util";
import crypto from "node:crypto";
import { closeDbPool } from "../src/db/pool.ts";
import { runMigrations } from "../src/db/migrator.ts";
import { AuthService } from "../src/auth/service.ts";
import { UsersRepository, type AdminUserRole } from "../src/db/repositories/users.repository.ts";
import { SessionsRepository } from "../src/db/repositories/sessions.repository.ts";
import { requireSecret } from "../src/env/index.ts";

const ROLES: readonly AdminUserRole[] = ["DEFAULT_ADMIN_ROLE", "RECEPTION_ROLE"];

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    role: { type: "string" },
    password: { type: "string" },
    "recovery-codes": { type: "string" },
    "no-migrate": { type: "boolean", default: false },
  },
  allowPositionals: true,
});

function fail(message: string): never {
  console.error(`\n[aprovisionamiento] ERROR: ${message}\n`);
  process.exit(1);
}

/** Contraseña aleatoria fuerte (24 caracteres base64url) cuando no se pasa `--password`. */
function generatePassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function main(): Promise<void> {
  const username = values.username?.trim();
  const role = values.role?.trim() as AdminUserRole | undefined;

  if (!username) fail("falta --username (p. ej. --username admin@hotel.es)");
  if (!role) fail(`falta --role (valores admitidos: ${ROLES.join(", ")})`);
  if (!ROLES.includes(role)) {
    fail(`rol no válido: ${role} (valores admitidos: ${ROLES.join(", ")})`);
  }

  // Fail-fast de secretos ANTES de tocar la base de datos: sin DATABASE_URL ni AES_SECRET_KEY
  // el aprovisionamiento no puede completarse, y es mejor saberlo de inmediato.
  requireSecret("DATABASE_URL");
  const aesKey = requireSecret("AES_SECRET_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(aesKey) && aesKey.length < 32) {
    fail("AES_SECRET_KEY debe ser hexadecimal de 32 bytes (64 caracteres) o una cadena de >= 32");
  }

  const recoveryCodeCount = values["recovery-codes"]
    ? Number.parseInt(values["recovery-codes"], 10)
    : 8;
  if (!Number.isInteger(recoveryCodeCount) || recoveryCodeCount < 4 || recoveryCodeCount > 20) {
    fail("--recovery-codes debe ser un entero entre 4 y 20");
  }

  if (!values["no-migrate"]) {
    await runMigrations();
  }

  const authService = new AuthService(new SessionsRepository(), new UsersRepository());
  const password = values.password ?? generatePassword();
  if (password.length < 12) {
    fail("la contraseña debe tener al menos 12 caracteres (D-04)");
  }

  const provisioned = await authService.provisionUser({
    username,
    password,
    role,
    recoveryCodeCount,
  });

  console.log("");
  console.log("=".repeat(72));
  console.log("  OPERADOR APROVISIONADO — ENTREGAR AL OPERADOR Y NO GUARDAR AQUÍ");
  console.log("=".repeat(72));
  console.log(`  Usuario    : ${provisioned.username}`);
  console.log(`  Rol        : ${provisioned.role}`);
  console.log(`  Contraseña : ${password}${values.password ? "" : "   (generada automáticamente)"}`);
  console.log("");
  console.log("  1) Alta del autenticador (Google Authenticator / Authy / 1Password):");
  console.log(`     ${provisioned.uri}`);
  console.log(`     Semilla TOTP (si el autenticador no admite QR): ${provisioned.secret}`);
  console.log("");
  console.log("  2) Códigos de rescate (UN SOLO USO; no se vuelven a mostrar):");
  for (const code of provisioned.recoveryCodes) {
    console.log(`     ${code}`);
  }
  console.log("");
  console.log("  La semilla se guarda CIFRADA (AES-256-GCM) en admin_users.totp_secret_enc.");
  console.log("  Rota credenciales con el mismo comando cuando sea necesario.");
  console.log("=".repeat(72));
  console.log("");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  })
  .finally(async () => {
    await closeDbPool();
  });
