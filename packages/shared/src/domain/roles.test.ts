import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BACK_OFFICE_ROLE_NAMES,
  LEGACY_BACK_OFFICE_ROLE_NAMES,
  TERMINAL_BACK_OFFICE_ROLE_NAMES,
  WALLET_BACK_OFFICE_ROLE_NAMES,
} from "./roles";

/**
 * Guardián del **vocabulario de roles de back-office** (vNext · F1 · T1.5).
 *
 * El vocabulario vive en un solo sitio (`domain/roles.ts`) y de él se derivan el enum zod, la
 * validación del alta de operadores y el acceso a las suites. Este guardián lo ata a lo que dicen los
 * artefactos de datos y de diseño, para que no vuelvan a aparecer listas duplicadas que se desvíen:
 *
 *   1. **Alineado con el esquema**: los roles declarados aparecen en el comentario canónico de
 *      `base_datos.sql` y en el `COMMENT ON COLUMN admin_users.role`.
 *   2. **Alineado con el diseño**: la tabla de roles del diccionario vNext propone exactamente los
 *      cuatro roles nuevos, y los cuatro están en el vocabulario.
 *   3. **Coherente con el contrato de datos**: los roles con wallet son un subconjunto de los que
 *      admite `operator_wallets.role` (cuyo CHECK incluye además `OWNER_BACKUP`, que **no** es un rol
 *      de back-office), y `admin_users.role` es `VARCHAR(30)`: ningún rol puede excederlo.
 *   4. **Sin solapes**: wallet, terminal y heredados son conjuntos disjuntos entre sí y subconjuntos
 *      del vocabulario.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..", "..");
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

const ROOT_SQL = "RepoTecnico/base_datos.sql";
const DICTIONARY = "RepoTecnico/propuesta_vNext/diccionario_datos.md";

/** Roles que el diccionario vNext propone (tabla «Roles extendidos en `admin_users`»). */
function proposedRolesInDictionary(): string[] {
  const dictionary = read(DICTIONARY);
  const section = dictionary.slice(dictionary.indexOf("## 2. Roles extendidos"));
  return [...section.matchAll(/^\|\s*`([A-Z_]+)`\s*\|/gm)].map((match) => match[1]!);
}

/** Valores admitidos por el CHECK de `operator_wallets.role`. */
function walletRolesInSchema(): string[] {
  const sql = read(ROOT_SQL);
  const check = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS operator_wallets"));
  const body = check.slice(0, check.indexOf(");"));
  const match = /role IN \(([^)]*)\)/.exec(body);
  return match ? [...match[1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!) : [];
}

describe("vocabulario de roles de back-office (T1.5)", () => {
  it("no repite roles y todos caben en `admin_users.role VARCHAR(30)`", () => {
    expect(new Set(BACK_OFFICE_ROLE_NAMES).size).toBe(BACK_OFFICE_ROLE_NAMES.length);
    for (const role of BACK_OFFICE_ROLE_NAMES) {
      expect(role.length, `${role} no cabe en VARCHAR(30)`).toBeLessThanOrEqual(30);
    }
  });

  it("los cuatro roles nuevos están en el vocabulario y los heredados se conservan", () => {
    for (const role of ["HEAD_MAINTENANCE", "HEAD_KEEPER", "MAINTENANCE_TECH", "HOUSEKEEPER"]) {
      expect(BACK_OFFICE_ROLE_NAMES).toContain(role);
    }
    // D3: los heredados NO se retiran en F1 (se retiran cuando se re-crean los usuarios).
    expect([...LEGACY_BACK_OFFICE_ROLE_NAMES]).toEqual(["HOUSEKEEPING", "MAINTENANCE"]);
    for (const role of LEGACY_BACK_OFFICE_ROLE_NAMES) {
      expect(BACK_OFFICE_ROLE_NAMES).toContain(role);
    }
  });

  it("coincide con el comentario canónico y con `COMMENT ON COLUMN admin_users.role`", () => {
    const sql = read(ROOT_SQL);
    for (const role of BACK_OFFICE_ROLE_NAMES) {
      expect(sql, `${role} no aparece en ${ROOT_SQL}`).toContain(role);
    }

    // Bidireccional: los roles que enumera el propio comentario de la columna son EXACTAMENTE los
    // declarados (si alguien añade uno al SQL y no al vocabulario, cae aquí). Se recorta al LITERAL
    // del comentario, no a la sentencia: si no, entrarían `COMMENT`, `COLUMN` y demás palabras.
    const desde = sql.indexOf("COMMENT ON COLUMN admin_users.role");
    const literal = sql.slice(sql.indexOf("'", desde) + 1, sql.indexOf("';", desde));
    // El token debe tener al menos 4 letras y TERMINAR en letra: así no entran `PIN` ni el `HEAD_*`
    // con el que el comentario se refiere a los dos jefes de forma genérica.
    const enComentario = [...literal.matchAll(/\b([A-Z][A-Z_]{2,}[A-Z])\b/g)]
      .map((match) => match[1]!)
      .filter((token, index, all) => all.indexOf(token) === index);
    expect(enComentario.sort()).toEqual([...BACK_OFFICE_ROLE_NAMES].sort());
  });

  it("coincide con la tabla de roles del diccionario vNext (en los dos sentidos)", () => {
    const propuestos = proposedRolesInDictionary();
    expect(propuestos).toEqual(["HEAD_MAINTENANCE", "HEAD_KEEPER", "MAINTENANCE_TECH", "HOUSEKEEPER"]);
    for (const role of propuestos) {
      expect(BACK_OFFICE_ROLE_NAMES, `${role} propuesto y no declarado`).toContain(role);
    }
  });

  it("los roles con wallet son los que admite `operator_wallets` (salvo la firma de emergencia)", () => {
    const delEsquema = walletRolesInSchema();
    // El CHECK admite la wallet de respaldo del Owner (D-C13), que no es un rol de back-office.
    expect(delEsquema).toContain("OWNER_BACKUP");
    expect(BACK_OFFICE_ROLE_NAMES).not.toContain("OWNER_BACKUP");

    const backOfficeDelEsquema = delEsquema.filter((role) => role !== "OWNER_BACKUP");
    expect([...WALLET_BACK_OFFICE_ROLE_NAMES].sort()).toEqual(backOfficeDelEsquema.sort());
  });

  it("wallet, terminal y heredados son disjuntos entre sí", () => {
    const grupos = [
      [...WALLET_BACK_OFFICE_ROLE_NAMES],
      [...TERMINAL_BACK_OFFICE_ROLE_NAMES],
      [...LEGACY_BACK_OFFICE_ROLE_NAMES],
    ];
    for (const grupo of grupos) {
      for (const role of grupo) expect(BACK_OFFICE_ROLE_NAMES).toContain(role);
    }
    const todos = grupos.flat();
    expect(new Set(todos).size, "hay un rol en dos grupos").toBe(todos.length);
  });
});
