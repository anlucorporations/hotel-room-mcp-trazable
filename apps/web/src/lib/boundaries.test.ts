import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de la frontera cliente/servidor de `@hotel/shared`.
 *
 * Contexto: el barril raíz `packages/shared/src/index.ts` reexporta módulos que solo funcionan
 * en servidor (BullMQ, `pg`, `ioredis`). Un componente de cliente que importe VALORES de ahí
 * arrastra `child_process` al bundle del navegador y rompe la aplicación: la home y `/historico`
 * devolvieron HTTP 500 por este motivo.
 *
 * El fallo se manifiesta en `next dev` mientras `next build` lo tolera por tree-shaking, así que
 * el pipeline podía estar en verde con la aplicación rota. Esta prueba cierra esa brecha: el
 * código de cliente debe importar el subpath isomorfo `@hotel/shared/domain`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");

/** Módulos de servidor que SÍ pueden usar el barril (todos declaran `server-only`). */
const SERVER_ONLY_ALLOWLIST = new Set([
  "lib/guard.ts",
  "lib/nights.ts",
  "lib/nonce-store.ts",
  "lib/server-client.ts",
  "lib/session.ts",
  "lib/ticket-ownership.ts",
  "lib/worker-api.ts",
]);

const SCANNED_DIRS = ["components", "lib"];
const EXTENSIONS = [".ts", ".tsx"];
const BARREL_IMPORT = /from\s+["']@hotel\/shared["']/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

describe("frontera cliente/servidor de @hotel/shared", () => {
  it("ningún módulo de cliente importa el barril raíz", () => {
    const offenders: string[] = [];

    for (const dirName of SCANNED_DIRS) {
      for (const file of collectSourceFiles(join(SRC, dirName))) {
        const relativePath = relative(SRC, file).split("\\").join("/");
        if (SERVER_ONLY_ALLOWLIST.has(relativePath)) continue;
        if (BARREL_IMPORT.test(readFileSync(file, "utf8"))) {
          offenders.push(relativePath);
        }
      }
    }

    expect(
      offenders,
      `Estos módulos importan el barril raíz "@hotel/shared" y pueden arrastrar BullMQ/pg al ` +
        `bundle del navegador. Usa "@hotel/shared/domain" (isomorfo) o añade el módulo a la ` +
        `lista blanca si de verdad es de servidor:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
