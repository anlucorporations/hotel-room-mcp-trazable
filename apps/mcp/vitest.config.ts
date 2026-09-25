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
        // --- Cableado de arranque ---------------------------------------------------------
        // `main.ts` resuelve la cadena (Anvil/Besu), construye `ViemChainReader` y arranca el HTTP
        // server; ejecuta `void main()` **al importarse**, así que importarlo en un test levanta el
        // servidor. Es composición pura: las herramientas, los esquemas y el servidor MCP (la
        // superficie que sí importa, RF-12/CU-08, docs/SRS.md §9) se miden en `tools/`, `server.ts` y
        // `http-server.ts`.
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
      // st/lines 93,97 % · branches 87,23 % · functions 92,85 %. Entero inferior con 1 punto.
      thresholds: {
        statements: 92,
        branches: 86,
        functions: 91,
        lines: 92,
      },
    },
  },
});
