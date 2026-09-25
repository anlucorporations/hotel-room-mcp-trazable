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
    setupFiles: ["./test/setup-env.ts"],
    /**
     * Cobertura (D-08). Umbrales de **trinquete**: valor realmente medido con el bloque `exclude`,
     * redondeado hacia abajo y con ~1 punto de margen. El objetivo de producto es 80 % (M8); el
     * hueco real de la web (páginas y componentes React sin entorno DOM) y su análisis están en
     * `RepoTecnico/cobertura.md`. NO se excluye `src/app/**` ni `src/components/**`: ese es
     * precisamente el trabajo pendiente, y esconderlo sería falsear el gate.
     */
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // --- Los propios tests: no son producto -----------------------------------------
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        // --- Artefactos generados / de compilación --------------------------------------
        // Salida de `next build` (RSC compiladas, chunks y caché): no es fuente.
        "**/.next/**",
        "**/out/**",
        "**/dist/**",
        // --- Ficheros que no son código de producto -------------------------------------
        // Declaraciones de tipos: sin código ejecutable.
        "**/*.d.ts",
        // Configuración de herramienta (next/postcss/tailwind/eslint/vitest): andamiaje.
        "**/*.config.*",
        // Utilidades y dobles compartidos por las suites (`test/fake-redis.ts`,
        // `test/empty-server-only.ts`, `test/guard-mock.ts`…): infraestructura de test.
        "**/test/**",
        // Scripts puntuales de operación, no runtime de la app.
        "**/scripts/**",
      ],
      // Trinquete: medido con las exclusiones de arriba (ver RepoTecnico/cobertura.md):
      // st/lines 24,95 % · branches 74,05 % · functions 53,84 %. Entero inferior con 1 punto.
      // El 80 % NO se alcanza aquí: falta el entorno DOM y las pruebas de componentes/páginas.
      thresholds: {
        statements: 23,
        branches: 73,
        functions: 52,
        lines: 23,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Las pruebas son HERMÉTICAS: nunca abren una conexión real. `@hotel/shared` se consume ya
      // empaquetado, así que su blocklist de JWT no se puede sustituir desde el barrel del
      // paquete; la frontera que sí se puede doblar es el cliente de Redis, que el bundle importa
      // como dependencia externa. Ver `test/fake-redis.ts`.
      ioredis: fileURLToPath(new URL("./test/fake-redis.ts", import.meta.url)),
      // `server-only` lanza fuera de la condición `react-server` que activa Next: en Vitest se
      // sustituye por un módulo vacío para poder probar las rutas de servidor. Ver el propio fichero.
      "server-only": fileURLToPath(new URL("./test/empty-server-only.ts", import.meta.url)),
    },
  },
});
