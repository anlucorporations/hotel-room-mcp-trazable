import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MissingSecretError, optionalSecret, requireSecret } from "@hotel/shared/env";

/**
 * Guardián de "ningún secreto en el código" (D-04, CWE-798, RNF-13).
 *
 * M3 eliminó los literales de secreto y las credenciales embebidas del repositorio. Esta prueba
 * falla si cualquiera de ellos REAPARECE en `apps/` o `packages/`. Las cadenas se componen por
 * concatenación para que este propio fichero no contenga el literal completo y no se
 * autodetecte.
 */
const RETIRED_LITERALS: ReadonlyArray<{ name: string; literal: string }> = [
  { name: "JWT_SECRET por defecto", literal: "hotel_marina_del_sol_jwt" + "_super_secret_key_2026_at_least_32_chars" },
  { name: "TICKET_SIGNING_SECRET por defecto", literal: "hotel_ticket_signing" + "_secret_key_2026_at_least_32_chars" },
  { name: "CLAVE AES por defecto", literal: "hotel_master_aes_key" + "_32_bytes_2026" },
  { name: "CLAVE VAPID privada por defecto", literal: "hotel_vapid_private" + "_key_secret_2026" },
  { name: "CLAVE VAPID pública inválida", literal: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgD" },
  { name: "Secreto de sesión de desarrollo", literal: "dev-insecure-session" + "-secret-change-me" },
  { name: "Semilla TOTP de ejemplo", literal: "JBSWY3DPEHP" + "K3PXP" },
  { name: "Contraseña de admin embebida", literal: "Hotel2026Admin" + "!" },
  { name: "Contraseña de recepción embebida", literal: "Hotel2026Recepcion" + "!" },
  {
    name: "Cadena de conexión con credenciales",
    literal: "postgresql://hotel_admin:" + "hotel_secret_2026@127.0.0.1:5432/hotel_nft_dev",
  },
];

/** Directorios de código vigilados (los mismos que puede tocar el equipo de producto). */
const SCANNED_ROOTS = ["apps", "packages"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  "out",
  "coverage",
  ".turbo",
  "artifacts",
  "cache",
  "typechain-types",
]);
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".prisma", ".sql"];

/**
 * Este propio guardián enumera los literales retirados, así que se excluye del escaneo (igual
 * que los subdirectorios de dependencias y artefactos). El resto de pruebas SÍ se escanean: si
 * una prueba reintroduce el literal completo de TOTP, el guardián falla.
 */
const SELF = "secrets-guardian.test.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../..");

function collectFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      collectFiles(full, out);
      continue;
    }
    if (entry.name === "package.json" || entry.name === "pnpm-lock.yaml") continue;
    if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

describe("guardián: ningún secreto ni credencial en el código (D-04)", () => {
  it("no reaparece ninguno de los literales retirados en apps/ ni packages/", () => {
    const offenders: string[] = [];

    for (const root of SCANNED_ROOTS) {
      for (const file of collectFiles(join(REPO_ROOT, root))) {
        if (file.endsWith(SELF)) continue;
        const content = readFileSync(file, "utf8");
        for (const { name, literal } of RETIRED_LITERALS) {
          if (content.includes(literal)) {
            offenders.push(`${relative(REPO_ROOT, file).split("\\").join("/")} → ${name}`);
          }
        }
      }
    }

    expect(
      offenders,
      "Estos ficheros contienen un secreto o credencial retirado en M3. Los secretos se leen del " +
        "entorno con `requireSecret` (fail-fast) y las credenciales de operador viven en la tabla " +
        "`admin_users`:\n  " + offenders.join("\n  "),
    ).toEqual([]);
  });

  it("el arranque falla en cerrado si falta un secreto obligatorio", () => {
    const variable = "HOTEL_GUARDIAN_SECRETO_INEXISTENTE";
    delete process.env[variable];

    expect(() => requireSecret(variable)).toThrow(MissingSecretError);
    expect(optionalSecret(variable)).toBeUndefined();
  });

  it("requireSecret devuelve el valor configurado y rechaza cadenas vacías", () => {
    const variable = "HOTEL_GUARDIAN_SECRETO_PRESENTE";
    process.env[variable] = "valor-de-prueba";
    try {
      expect(requireSecret(variable)).toBe("valor-de-prueba");
      process.env[variable] = "   ";
      expect(() => requireSecret(variable)).toThrow(MissingSecretError);
    } finally {
      delete process.env[variable];
    }
  });
});
