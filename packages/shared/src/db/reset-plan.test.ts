import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHECKPOINT_TABLES, PRESERVED_TABLES, WIPE_ORDER, buildDeleteStatements } from "./reset-plan";

/**
 * Guardián del **plan de inicialización** (2026-10-05).
 *
 * Comprueba el plan contra el esquema real (`RepoTecnico/base_datos.sql`), que es la fuente de
 * verdad: si alguien añade una tabla o una clave foránea y no la clasifica, o si el orden de borrado
 * deja un hijo después de su padre, esta prueba se pone roja **antes** de que nadie ejecute el reset
 * contra una base con datos.
 */

const SCHEMA_PATH = fileURLToPath(new URL("../../../../RepoTecnico/base_datos.sql", import.meta.url));
const schema = readFileSync(SCHEMA_PATH, "utf8");

/** `tabla → tablas a las que apunta con REFERENCES` según el esquema. */
function readForeignKeys(): { tables: string[]; refs: Map<string, string[]> } {
  const blocks = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\);/gs)];
  const refs = new Map<string, string[]>();
  const tables: string[] = [];
  for (const [, name, body] of blocks) {
    tables.push(name!);
    refs.set(name!, [...new Set([...body!.matchAll(/REFERENCES\s+(\w+)\s*\(/g)].map((m) => m[1]!))]);
  }
  return { tables, refs };
}

const { tables: schemaTables, refs } = readForeignKeys();
const wipeIndex = new Map(WIPE_ORDER.map((table, index) => [table as string, index]));

describe("plan de reset · cobertura", () => {
  it("clasifica TODAS las tablas del esquema (borrar, conservar o checkpoint)", () => {
    const classified = new Set<string>([...WIPE_ORDER, ...PRESERVED_TABLES, ...CHECKPOINT_TABLES]);
    const sinClasificar = schemaTables.filter((table) => !classified.has(table));
    expect(sinClasificar, "tablas del esquema sin clasificar en el plan").toEqual([]);
    // Y al revés: nada del plan que ya no exista en el esquema (evita borrados fantasma).
    const inexistentes = [...classified].filter((table) => !schemaTables.includes(table));
    expect(inexistentes, "tablas del plan que no están en el esquema").toEqual([]);
  });

  it("no repite tablas ni solapa las listas", () => {
    expect(new Set(WIPE_ORDER).size).toBe(WIPE_ORDER.length);
    for (const table of PRESERVED_TABLES) expect(wipeIndex.has(table)).toBe(false);
    for (const table of CHECKPOINT_TABLES) expect(wipeIndex.has(table)).toBe(false);
  });
});

describe("plan de reset · orden de borrado", () => {
  it("borra cada hijo antes que su padre (respeta RESTRICT y SET NULL)", () => {
    const infracciones: string[] = [];
    for (const [child, parents] of refs) {
      const childIndex = wipeIndex.get(child);
      if (childIndex === undefined) continue; // conservada o checkpoint: no se borra
      for (const parent of parents) {
        const parentIndex = wipeIndex.get(parent);
        if (parentIndex === undefined) continue; // el padre se conserva
        if (childIndex > parentIndex) {
          infracciones.push(`${child} (posición ${childIndex}) se borra después de ${parent} (${parentIndex})`);
        }
      }
    }
    expect(infracciones).toEqual([]);
  });

  it("borra `rooms` después de todo lo que la referencia y conserva `preventive_plans` (SET NULL, no CASCADE)", () => {
    const roomsIndex = wipeIndex.get("rooms");
    expect(roomsIndex).toBeDefined();
    const referencing = [...refs].filter(([, parents]) => parents.includes("rooms")).map(([child]) => child);
    for (const child of referencing) {
      const childIndex = wipeIndex.get(child);
      // Las conservadas (preventive_plans) no se borran; las operativas sí, y siempre antes que rooms.
      if (childIndex !== undefined) expect(childIndex, `${child} debe borrarse antes que rooms`).toBeLessThan(roomsIndex!);
    }
    expect(PRESERVED_TABLES).toContain("preventive_plans");
    expect(WIPE_ORDER).toContain("preventive_tasks");
  });

  it("genera una sentencia de borrado por tabla, en orden", () => {
    const statements = buildDeleteStatements();
    expect(statements).toHaveLength(WIPE_ORDER.length);
    expect(statements[0]).toBe(`DELETE FROM ${WIPE_ORDER[0]}`);
    expect(statements.at(-1)).toBe(`DELETE FROM ${WIPE_ORDER.at(-1)}`);
    expect(statements.every((statement) => statement.startsWith("DELETE FROM "))).toBe(true);
    // Nada de TRUNCATE: arrastraría los planes preventivos por la FK de `rooms`.
    expect(statements.join(" ")).not.toContain("TRUNCATE");
  });
});
