/**
 * Constantes compartidas por `playwright.config.ts` y los specs del E2E con **sesión y wallet**
 * (A5 · Fase 4).
 *
 * Se centralizan aquí porque el `webServer` recibe `JWT_SECRET`/`REDIS_URL` por entorno y el spec
 * debe firmar el mismo JWT y apuntar al mismo Redis falso; si se duplicaran los valores, un cambio
 * en un sitio dejaría el otro en silencio (el test fallaría como «sin sesión», que es justo lo que
 * el test intenta demostrar que ya no ocurre).
 */

/** Secreto HMAC de los access tokens del back-office **solo para el E2E** (nunca real). */
export const E2E_JWT_SECRET = "e2e-wallet-jwt-secret-not-for-any-real-environment-0001";

/** `SESSION_SECRET` de la suite (ya existía; se mantiene el mismo valor que usaba el config). */
export const E2E_SESSION_SECRET = "e2e-test-secret";

/** Puerto del Redis falso que arranca `e2e/support/start-web.mjs`. */
export const E2E_REDIS_PORT = 6390;

/** URL que recibe el servidor de Next (`REDIS_URL`). */
export const E2E_REDIS_URL = `redis://127.0.0.1:${E2E_REDIS_PORT}/0`;

/** Cookie HttpOnly del access token (`ACCESS_TOKEN_COOKIE` en `src/lib/guard.ts`). */
export const E2E_ACCESS_TOKEN_COOKIE = "hotel_access_token";

/** RPC al que apunta el cliente por defecto (`src/config/chain.ts`); el spec lo intercepta. */
export const E2E_RPC_URL = "http://127.0.0.1:8545";

/** Origen del `webServer` de Playwright (se puede cambiar con `E2E_PORT`, igual que el config). */
export const E2E_BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT ?? "3100"}`;
