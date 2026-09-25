import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    // Entry isomorfo (apto para navegador) expuesto como `@hotel/shared/domain`. Se genera
    // como `dist/domain.js` a partir de `src/browser.ts` para que source y subpath casen.
    domain: "src/browser.ts",
    env: "src/env/index.ts",
    deployments: "src/deployments/index.ts",
    health: "src/health/index.ts",
    fixtures: "src/fixtures/index.ts",
    abi: "src/abi/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // viem y zod los resuelven los consumidores desde el workspace.
  external: ["viem", "zod"],
});
