import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PREVENTIVE_VALIDATION_STATUSES,
  ROOM_OPERATIONAL_STATUSES,
  ROOM_PUBLICATION_STATUSES,
  SIGNATURE_ENTITY_TYPES,
  SIGNATURE_STATUSES,
  SUPPLY_ALERT_STATUSES,
} from "./operations-state";

/**
 * Guardián del **vocabulario canónico de estados y tipos de entidad** (vNext · F1 · T1.6).
 *
 * El SQL es la fuente de verdad y `domain/operations-state.ts` es su espejo tipado. Este test ata los
 * dos en **los dos sentidos**: si alguien añade un valor al `CHECK` y no al vocabulario (o al revés),
 * falla; y si el valor más largo no cabe en la columna (`VARCHAR`), también. Esa última comprobación
 * habría cazado el defecto real que se corrigió en F1: `rooms.operational_status` era `VARCHAR(12)`
 * mientras el `CHECK` admitía `IN_INSPECTION` (13 caracteres).
 *
 * Se comprueban los dos artefactos que aplican esquema: el script raíz (`RepoTecnico/base_datos.sql`,
 * que ejecuta la operación y el CI) y el bloque embebido de `migrator.ts` (lo que aplica el worker).
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..", "..");
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");

const ROOT_SQL_PATH = "RepoTecnico/base_datos.sql";
const MIGRATOR_TS_PATH = "packages/shared/src/db/migrator.ts";

const ROOT_SQL = stripLineComments(read(ROOT_SQL_PATH));
const MIGRATOR = stripLineComments(read(MIGRATOR_TS_PATH));

/**
 * Quita los comentarios de línea (`-- …`) antes de parsear. Sin esto, una frase de un comentario que
 * acabe en `);` (p. ej. `-- … (D-6, D-21); …`) se confundiría con el cierre de un `CREATE TABLE`.
 */
function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Cuerpo de un `CREATE TABLE IF NOT EXISTS <tabla>` (hasta el `\n);` de cierre). */
function createTableBody(sql: string, table: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${table}`;
  const start = sql.indexOf(marker);
  expect(start, `no se encontró ${marker} en el artefacto`).toBeGreaterThanOrEqual(0);
  const body = sql.slice(start + marker.length);
  const end = body.indexOf("\n);");
  expect(end, `no se encontró el cierre de ${table}`).toBeGreaterThanOrEqual(0);
  return body.slice(0, end);
}

/**
 * Literales de un `CHECK` nombrado, tomando la **última** definición: el esquema redefine algunos con
 * `ALTER TABLE … DROP CONSTRAINT … / ADD CONSTRAINT …` y manda la última (p. ej. `IN_INSPECTION`).
 */
function checkValues(sql: string, constraint: string): string[] {
  const re = new RegExp(`CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(([^;]*?)\\)\\s*[,;]`, "g");
  const matches = [...sql.matchAll(re)];
  const last = matches.at(-1);
  expect(last, `no se encontró el CHECK ${constraint}`).toBeDefined();
  return [...last![1]!.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!);
}

/** Literales del `CHECK` en línea de una columna (p. ej. `supply_alerts.status`). */
function inlineCheckValues(sql: string, table: string, column: string): string[] {
  const body = createTableBody(sql, table);
  const re = new RegExp(`${column}\\s+VARCHAR\\(\\d+\\)[^,]*CHECK\\s*\\(([^)]*)\\)`);
  const match = re.exec(body);
  expect(match, `no se encontró el CHECK en línea de ${table}.${column}`).not.toBeNull();
  return [...match![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
}

/** Longitud declarada de una columna `VARCHAR(n)` de un `CREATE TABLE`. */
function varcharLength(sql: string, table: string, column: string): number {
  const body = createTableBody(sql, table);
  const re = new RegExp(`\\b${column}\\s+VARCHAR\\((\\d+)\\)`);
  const match = re.exec(body);
  expect(match, `no se encontró ${table}.${column} VARCHAR(n)`).not.toBeNull();
  return Number(match![1]);
}

/** Longitud declarada de una columna añadida con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. */
function addedVarcharLength(sql: string, table: string, column: string): number {
  const re = new RegExp(
    `ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS ${column} VARCHAR\\((\\d+)\\)`,
  );
  const match = re.exec(sql);
  expect(match, `no se encontró el ADD COLUMN de ${table}.${column}`).not.toBeNull();
  return Number(match![1]);
}

const VOCABULARIES = [
  {
    name: "SIGNATURE_ENTITY_TYPES",
    values: SIGNATURE_ENTITY_TYPES,
    check: "on_chain_signatures_entity_check",
    table: "on_chain_signatures",
    column: "entity_type",
    declared: varcharLength(ROOT_SQL, "on_chain_signatures", "entity_type"),
  },
  {
    name: "SIGNATURE_STATUSES",
    values: SIGNATURE_STATUSES,
    check: "on_chain_signatures_status_check",
    table: "on_chain_signatures",
    column: "status",
    declared: varcharLength(ROOT_SQL, "on_chain_signatures", "status"),
  },
  {
    name: "ROOM_PUBLICATION_STATUSES",
    values: ROOM_PUBLICATION_STATUSES,
    check: "rooms_publication_status_check",
    table: "rooms",
    column: "publication_status",
    declared: varcharLength(ROOT_SQL, "rooms", "publication_status"),
  },
  {
    name: "ROOM_OPERATIONAL_STATUSES",
    values: ROOM_OPERATIONAL_STATUSES,
    check: "rooms_operational_status_check",
    table: "rooms",
    column: "operational_status",
    declared: varcharLength(ROOT_SQL, "rooms", "operational_status"),
  },
  {
    name: "PREVENTIVE_VALIDATION_STATUSES",
    values: PREVENTIVE_VALIDATION_STATUSES,
    check: "preventive_tasks_validation_status_check",
    table: "preventive_tasks",
    column: "validation_status",
    declared: addedVarcharLength(ROOT_SQL, "preventive_tasks", "validation_status"),
  },
] as const;

describe("vocabulario canónico de estados (T1.6)", () => {
  it("los seis vocabularios no repiten valores y caben en su columna", () => {
    for (const vocabulary of VOCABULARIES) {
      expect(new Set(vocabulary.values).size, `${vocabulary.name} repite valores`).toBe(
        vocabulary.values.length,
      );
      const longest = Math.max(...vocabulary.values.map((value) => value.length));
      expect(
        longest,
        `${vocabulary.name}: el valor más largo (${longest}) no cabe en ${vocabulary.table}.${vocabulary.column} VARCHAR(${vocabulary.declared})`,
      ).toBeLessThanOrEqual(vocabulary.declared);
    }

    const alertStatuses = SUPPLY_ALERT_STATUSES;
    expect(new Set(alertStatuses).size).toBe(alertStatuses.length);
    expect(Math.max(...alertStatuses.map((value) => value.length))).toBeLessThanOrEqual(
      varcharLength(ROOT_SQL, "supply_alerts", "status"),
    );
  });

  it.each(VOCABULARIES)(
    "$name coincide con el CHECK nombrado de los dos artefactos de esquema",
    ({ values, check }) => {
      expect(checkValues(ROOT_SQL, check)).toEqual([...values]);
      expect(checkValues(MIGRATOR, check)).toEqual([...values]);
    },
  );

  it("SUPPLY_ALERT_STATUSES coincide con el CHECK en línea de `supply_alerts.status`", () => {
    expect(inlineCheckValues(ROOT_SQL, "supply_alerts", "status")).toEqual([
      ...SUPPLY_ALERT_STATUSES,
    ]);
    expect(inlineCheckValues(MIGRATOR, "supply_alerts", "status")).toEqual([
      ...SUPPLY_ALERT_STATUSES,
    ]);
  });

  it("`operational_status` está ensanchado a VARCHAR(20) en el script y en el migrador", () => {
    // Regresión del defecto corregido en F1: `IN_INSPECTION` mide 13 y la columna era VARCHAR(12).
    expect(ROOM_OPERATIONAL_STATUSES).toContain("IN_INSPECTION");
    expect(varcharLength(ROOT_SQL, "rooms", "operational_status")).toBe(20);
    expect(varcharLength(MIGRATOR, "rooms", "operational_status")).toBe(20);
    for (const sql of [ROOT_SQL, MIGRATOR]) {
      expect(sql).toContain("ALTER TABLE rooms ALTER COLUMN operational_status TYPE VARCHAR(20)");
    }
  });
});
