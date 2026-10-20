import { defineConfig, devices } from "@playwright/test";
import {
  E2E_JWT_SECRET,
  E2E_REDIS_PORT,
  E2E_REDIS_URL,
  E2E_RPC_URL,
  E2E_SESSION_SECRET,
} from "./e2e/support/e2e-env";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E con Playwright. Requiere `pnpm --filter @hotel/web build` previo: el `webServer`
 * arranca `next start` sobre el build de producción.
 *
 * Desde la Fase 4 el `webServer` es `e2e/support/start-web.mjs`: levanta un **Redis falso** en
 * memoria (para que el guard verifique el JWT de la sesión sin infraestructura) y después el
 * servidor de Next. Es lo que permite el spec `wallet-publicacion.spec.ts` (A5: wallet inyectada
 * con sesión real) sin convertir la suite en dependiente de PostgreSQL/Redis reales.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // **Idioma fijo de la suite**: el contrato de idioma del producto es cookie `NEXT_LOCALE` y, si
    // no hay, `Accept-Language` (ver `src/i18n/request.ts`). El navegador de Playwright anuncia
    // `en-US` por defecto, así que las aserciones sobre el copy en español («Asistente»,
    // «Resultados de tu consulta…») fallaban según el idioma del runner, no por el código. Fijarlo
    // aquí hace la suite determinista y comprueba el idioma **por defecto** del producto.
    locale: "es-ES",
  },
  webServer: {
    command: `node e2e/support/start-web.mjs ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2E hermético: sin backend (PostgreSQL/worker/LLM). Las vistas muestran su estado degradado
    // y `/api/assistant` responde 503 de forma determinista, independientemente de cualquier demo
    // local en marcha (TC-E2E-031, a11y de estados degradados).
    //
    // Sesión (A5): `JWT_SECRET` + `REDIS_URL` apuntan al Redis falso del wrapper, de modo que un
    // JWT firmado por el spec es una sesión de back-office válida y verificable. `RPC_URL` es el
    // mismo origen que el cliente (8545); el spec y la CSP del middleware lo permiten, y cuando
    // ningún test lo intercepta la conexión se rechaza (estado degradado honesto, como antes con
    // `:1`).
    //
    // OJO: **no** es hermético frente a PostgreSQL. Si la base local está viva y poblada,
    // el catálogo sirve noches reales y el escaneo mide también las tarjetas de noche (con datos
    // y en su animación de entrada), no solo el estado degradado. Es deliberado: así el escaneo
    // cubre los dos escenarios; la medición se hace con movimiento reducido para que no se
    // capture a mitad de la transición (`apps/web/e2e/a11y.spec.ts`).
    env: {
      SESSION_SECRET: E2E_SESSION_SECRET,
      JWT_SECRET: E2E_JWT_SECRET,
      REDIS_URL: E2E_REDIS_URL,
      E2E_REDIS_PORT: String(E2E_REDIS_PORT),
      ANTHROPIC_API_KEY: "",
      RPC_URL: E2E_RPC_URL,
      WORKER_BASE_URL: "http://127.0.0.1:1",
    },
  },
  // La suite hermética corre en desktop y en móvil (RNF-18/RNF-01): los specs actuales solo
  // dependen de cabeceras, estados degradados y formularios, que se comportan igual en ambos
  // viewports, por lo que pasan sin cambios en "Pixel 5". Si un futuro spec asumiera desktop,
  // restríngelo con `test.skip(test.info().project.name === "mobile", "motivo")`.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
