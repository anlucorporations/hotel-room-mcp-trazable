import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E con Playwright. Requiere `pnpm --filter @hotel/web build` previo: el `webServer`
 * arranca `next start` sobre el build de producción.
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
  },
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2E hermético: sin backend (RPC/worker/LLM). Las vistas muestran su estado degradado y
    // `/api/assistant` responde 503 de forma determinista, independientemente de cualquier demo
    // local en marcha (TC-E2E-031, a11y de estados degradados).
    //
    // OJO: **no** es hermético frente a PostgreSQL/Redis. Si la base local está viva y poblada,
    // el catálogo sirve noches reales y el escaneo mide también las tarjetas de noche (con datos
    // y en su animación de entrada), no solo el estado degradado. Es deliberado: así el escaneo
    // cubre los dos escenarios; la medición se hace con movimiento reducido para que no se
    // capture a mitad de la transición (`apps/web/e2e/a11y.spec.ts`).
    env: {
      SESSION_SECRET: "e2e-test-secret",
      ANTHROPIC_API_KEY: "",
      RPC_URL: "http://127.0.0.1:1",
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
