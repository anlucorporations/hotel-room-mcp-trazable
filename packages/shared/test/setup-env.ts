/**
 * Entorno de PRUEBA de `@hotel/shared`.
 *
 * Las claves son evidentemente ficticias y solo existen dentro del proceso de Vitest: en
 * runtime y en el build se exige el valor real de `.env` (fail-fast con `requireSecret`). Se
 * definen aquí en lugar de en los ficheros de prueba para que ninguna prueba dependa de un
 * literal concreto y para que un valor ausente falle de forma homogénea en toda la suite.
 */
const TEST_SECRETS: Record<string, string> = {
  JWT_SECRET: "test-only-jwt-secret-not-for-any-real-environment-0001",
  TICKET_SIGNING_SECRET: "test-only-ticket-signing-secret-not-for-real-env-0002",
  AES_SECRET_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  CHECKIN_SECRET_KEY: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  DATABASE_URL: "postgresql://hotel_admin:test_only@127.0.0.1:5432/hotel_nft_test",
  REDIS_URL: "redis://127.0.0.1:6379/15",
};

for (const [key, value] of Object.entries(TEST_SECRETS)) {
  process.env[key] = value;
}
