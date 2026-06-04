import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    env: "src/env/index.ts",
    deployments: "src/deployments/index.ts",
    health: "src/health/index.ts",
    fixtures: "src/fixtures/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // viem y zod los resuelven los consumidores desde el workspace.
  external: ["viem", "zod"],
});
