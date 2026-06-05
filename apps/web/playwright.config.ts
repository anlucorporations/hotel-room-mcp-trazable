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
    env: {
      SESSION_SECRET: "e2e-test-secret",
      ANTHROPIC_API_KEY: "",
      RPC_URL: "http://127.0.0.1:1",
      WORKER_BASE_URL: "http://127.0.0.1:1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
