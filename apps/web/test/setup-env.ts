/**
 * Entorno de PRUEBA de `@hotel/web`.
 *
 * Antes, `apps/web/src/lib/session.ts` caía a un secreto de desarrollo conocido cuando faltaba
 * `SESSION_SECRET`; ahora el arranque falla en cerrado, así que la suite de pruebas declara sus
 * propios valores ficticios (nunca válidos fuera de este proceso de Vitest).
 */
const TEST_SECRETS: Record<string, string> = {
  JWT_SECRET: "test-only-jwt-secret-not-for-any-real-environment-0001",
  SESSION_SECRET: "test-only-session-secret-not-for-any-real-environment-0003",
  TICKET_SIGNING_SECRET: "test-only-ticket-signing-secret-not-for-real-env-0002",
  AES_SECRET_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CHECKIN_SECRET_KEY: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  DATABASE_URL: "postgresql://hotel_admin:test_only@127.0.0.1:5432/hotel_nft_test",
  REDIS_URL: "redis://127.0.0.1:6379/15",
};

for (const [key, value] of Object.entries(TEST_SECRETS)) {
  process.env[key] = value;
}

/** Secretos de prueba reutilizables por los helpers de los tests (nunca salen de este proceso). */
export const TEST_JWT_SECRET = TEST_SECRETS.JWT_SECRET;
export const TEST_AES_SECRET_KEY = TEST_SECRETS.AES_SECRET_KEY;
