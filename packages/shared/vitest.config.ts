import { defineConfig } from "vitest/config";

/**
 * Cobertura (D-08). Los umbrales son un **trinquete**: se fijan al valor realmente medido con el
 * bloque `exclude` de abajo, redondeado **hacia abajo** y con ~1 punto de margen, para que el gate
 * bloquee una regresión hoy sin declarar un cumplimiento que no existe. El objetivo de producto es
 * 80 % (M8); ver `RepoTecnico/cobertura.md` para el hueco real y honesto.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/setup-env.ts"],
    /**
     * Las pruebas de `AuthService` cifran con **bcrypt** (coste 12) y cada hash tarda ~0,5-3 s; con
     * `pnpm test` (turbo) todos los paquetes corren a la vez y el coste por CPU dispara el timeout
     * por defecto (15 s), que se traducía en fallos **intermitentes** de una suite verde
     * (`Recovery Codes`, `Aprovisionamiento TOTP`) sin que hubiera ninguna regresión. El límite se
     * sube a 60 s: los asserts no cambian, solo se deja de castigar a la máquina por ir cargada.
     */
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      // `coverage` es artefacto local (git-ignored): se puede borrar y regenerar.
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        // --- Los propios tests: no son producto -------------------------------------------
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        // Guardianes de invariantes de repositorio (arquitectura y documentación): auditan ficheros
        // del monorepo, no forman parte del runtime del paquete. Además, el de documentación tiene que
        // citar los patrones prohibidos para poder detectarlos, así que medirlo en cobertura no
        // informa de nada.
        "src/**/*guardian.test.ts",
        // --- Artefactos generados / de compilación ----------------------------------------
        // ABI volcado del compilador de Solidity (`forge inspect <C> abi` → fichero .ts). Son
        // **literales JSON generados**, no lógica escrita a mano: en `shared` suman 1791 de las
        // 2516 sentencias sin cubrir (71 %). Nadie ramifica dentro de un ABI, así que dejarlos
        // dentro no mide calidad: solo diluye la señal. Se regeneran con `pnpm contracts:build`.
        "src/abi/**",
        // Salidas de build (tsup) y del framework: nunca son fuente.
        "**/dist/**",
        "**/.next/**",
        "**/out/**",
        // --- Ficheros que no son código de producto ---------------------------------------
        // Declaraciones de tipos: no generan código ejecutable que se pueda cubrir.
        "**/*.d.ts",
        // Configuración de herramienta (vitest/tsup/eslint…): es andamiaje, no producto.
        "**/*.config.*",
        // Utilidades y dobles de prueba compartidos (`test/setup-env.ts`): infraestructura de test.
        "**/test/**",
        // Scripts operativos de un solo uso (`scripts/create-admin.ts`): se ejecutan a mano contra
        // una base de datos real, no forman parte del runtime del paquete.
        "**/scripts/**",
        // Barrel raíz de re-exportación: `src/index.ts` no tiene lógica propia, solo `export *`.
        // Se mantiene aquí (ya estaba excluido) para que no infle el denominador con líneas sin
        // ramas posibles; el resto de barrels con contenido propio (`env/index.ts`,
        // `health/index.ts`…) SÍ se miden.
        "src/index.ts",
      ],
      // Trinquete: medido con las exclusiones de arriba (ver RepoTecnico/cobertura.md):
      // st/lines 79,21 % · branches 80,47 % · functions 75,00 %. Se fija el entero inferior con
      // 1 punto de margen. NO se pone 80: no se alcanza.
      thresholds: {
        statements: 78,
        branches: 79,
        functions: 74,
        lines: 78,
      },
    },
  },
});
