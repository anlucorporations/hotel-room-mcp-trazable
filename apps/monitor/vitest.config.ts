import { defineConfig } from "vitest/config";

/**
 * Cobertura (D-08). Umbrales de **trinquete**: valor realmente medido con el bloque `exclude`,
 * redondeado hacia abajo y con ~1 punto de margen. El objetivo de producto es 80 % (M8); el hueco
 * real está documentado en `RepoTecnico/cobertura.md`.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        // --- Los propios tests: no son producto -------------------------------------------
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        // Dobles de prueba (`test-fakes.ts`): infraestructura de test, no runtime del monitor.
        "src/**/test-fakes.ts",
        // --- Cableado de arranque ---------------------------------------------------------
        // `main.ts` es el *composition root* del monitor: instancia `FetchHealthProbe`,
        // `EmailAlerter` y `MonitorCore`, registra SIGINT/SIGTERM y llama a `void main()` **al
        // importarse**. No es testeable en unitario sin arrancar el proceso; la lógica medida está
        // en `monitor-core.ts`, `probe.ts`, `alerter.ts` y `chain-monitor.ts`.
        "src/main.ts",
        // --- Artefactos generados / de compilación ----------------------------------------
        "**/dist/**",
        "**/.next/**",
        "**/out/**",
        // --- Ficheros que no son código de producto ---------------------------------------
        "**/*.d.ts",
        "**/*.config.*",
        "**/test/**",
        "**/scripts/**",
      ],
      // Trinquete: medido con las exclusiones de arriba (ver RepoTecnico/cobertura.md):
      // st/lines 91,12 % · branches 86,36 % · functions 93,10 %. Entero inferior con 1 punto.
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 92,
        lines: 90,
      },
    },
  },
});
