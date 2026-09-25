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
        // Dobles de prueba (`test-fakes.ts`): infraestructura de test, no runtime del worker.
        "src/**/test-fakes.ts",
        // --- Cableado de arranque ---------------------------------------------------------
        // `main.ts` compone las implementaciones concretas y llama a `void main()` **al importarse**
        // (levanta HTTP + BullMQ + planificador y registra señales). Un test unitario no puede
        // importarlo sin arrancar el proceso entero; la lógica sí vive en módulos medidos
        // (`run-worker.ts`, `listener-runtime.ts`, `burn-scheduler.ts`, `email-consumer.ts`…).
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
      // st/lines 80,68 % · branches 88,28 % · functions 85,36 %. Entero inferior con 1 punto de
      // margen de seguridad.
      thresholds: {
        statements: 79,
        branches: 87,
        functions: 84,
        lines: 79,
      },
    },
  },
});
