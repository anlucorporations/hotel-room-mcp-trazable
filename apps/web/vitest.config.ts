import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests unitarios server-side de la web (orquestación del asistente y validación de tx).
 * Los E2E de Playwright (`e2e/*.spec.ts`) se ejecutan aparte (`test:e2e`) y se excluyen aquí.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
