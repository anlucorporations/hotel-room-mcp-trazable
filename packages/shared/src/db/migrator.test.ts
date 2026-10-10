import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { INITIAL_SCHEMA_SQL, resetDatabase, runMigrations } from "./migrator";

/**
 * Migración del esquema (F1 · Fundaciones de la vNext).
 *
 * Lo que defiende esta suite, sin necesidad de un PostgreSQL vivo:
 *
 *   1. **`runMigrations` aplica el esquema una sola vez** y `resetDatabase` desmonta y vuelve a
 *      montar (los `DROP` de las 12 tablas nuevas incluidos).
 *   2. **Idempotencia por construcción**: todo `CREATE TABLE`/`CREATE INDEX` del esquema es
 *      `IF NOT EXISTS` y la semilla de áreas usa `ON CONFLICT DO NOTHING`; sin esto, la segunda
 *      pasada que exige el gate de F1 fallaría.
 *   3. **El bloque vNext está completo**: 12 tablas, 19 columnas de extensión, 3 CHECK redefinidas,
 *      semilla de 10 áreas (4 críticas) y el trigger append-only.
 *   4. **Sincronía triple (P8)**: el bloque vNext es el MISMO texto en los tres artefactos
 *      (`db/migrator.ts`, `RepoTecnico/base_datos.sql` y el aprobado
 *      `RepoTecnico/propuesta_vNext/base_datos.sql`). Es el defecto H-08 de la auditoría vNext: dos
 *      copias del mismo esquema que ya divergieron una vez.
 *
 * Lo que **no** cubre (y sigue pendiente del ciclo): aplicar el SQL contra un PostgreSQL real. En este
 * entorno no hay `psql`/`postgres`/`docker`, y el CI no tiene servicio de PostgreSQL: es el hueco A4 /
 * decisión D11 del análisis de arranque.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..", "..");

/** Doble de pool: solo se comprueba QUÉ se ejecuta, no contra una base real. */
function fakePool() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { pool: { query } as unknown as Pool, query };
}

const VNEXT_MARKER = "-- 2. Semilla de roles extendidos";

/** Texto del bloque vNext de un artefacto (recortando su cierre particular). */
function vnextBlock(path: string): string {
  const text = readFileSync(join(REPO_ROOT, path), "utf8");
  const start = text.indexOf(VNEXT_MARKER);
  expect(start, `${path} no contiene el bloque vNext`).toBeGreaterThan(-1);
  let body = text.slice(start);
  for (const end of ["\n`;", "\n-- Fin del script", "\n\n\n-- ===="]) {
    const at = body.indexOf(end);
    if (at > 0) body = body.slice(0, at);
  }
  return body
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

describe("runMigrations · esquema vNext", () => {
  it("aplica el esquema completo en una sola sentencia", async () => {
    const { pool, query } = fakePool();

    await runMigrations(pool);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toBe(INITIAL_SCHEMA_SQL);
  });

  it("es idempotente por construcción (IF NOT EXISTS / ON CONFLICT)", () => {
    const creaciones = [...INITIAL_SCHEMA_SQL.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/g)];
    const indices = [...INITIAL_SCHEMA_SQL.matchAll(/CREATE INDEX(?! IF NOT EXISTS)/g)];
    const extensiones = [...INITIAL_SCHEMA_SQL.matchAll(/CREATE EXTENSION(?! IF NOT EXISTS)/g)];

    expect(creaciones, "CREATE TABLE sin IF NOT EXISTS").toEqual([]);
    expect(indices, "CREATE INDEX sin IF NOT EXISTS").toEqual([]);
    expect(extensiones, "CREATE EXTENSION sin IF NOT EXISTS").toEqual([]);
    // La semilla de áreas se reejecuta sin duplicar.
    expect(INITIAL_SCHEMA_SQL).toContain("INSERT INTO maintenance_area_types");
    expect(INITIAL_SCHEMA_SQL).toContain("ON CONFLICT (code) DO NOTHING");
  });

  it("incluye las 12 tablas, las 19 columnas, las 3 CHECK, la semilla y el trigger", () => {
    // El esquema completo trae además las migraciones incrementales anteriores (21 columnas más):
    // lo específico del ciclo F1 se comprueba sobre el bloque vNext.
    const bloque = vnextBlock("packages/shared/src/db/migrator.ts");
    const tablas = [
      "terminal_operators",
      "operator_wallets",
      "on_chain_signatures",
      "maintenance_area_types",
      "maintenance_areas",
      "maintenance_area_tasks",
      "maintenance_area_logs",
      "housekeeping_inspections",
      "operator_audit_log",
      "housekeeping_damage_charges",
      "supply_alerts",
      "damage_charge_guest_notifications",
    ];
    for (const tabla of tablas) {
      expect(bloque, `falta la tabla ${tabla}`).toContain(`CREATE TABLE IF NOT EXISTS ${tabla} (`);
    }

    const columnas = [...bloque.matchAll(/ADD COLUMN IF NOT EXISTS [a-z_]+/g)];
    expect(columnas).toHaveLength(19);

    for (const check of [
      "maintenance_incidents_reported_by_role_check",
      "rooms_operational_status_check",
      "preventive_tasks_validation_status_check",
    ]) {
      expect(bloque).toContain(`DROP CONSTRAINT IF EXISTS ${check}`);
      expect(bloque).toContain(`ADD CONSTRAINT ${check}`);
    }

    // Semilla: 10 áreas, 4 críticas (los códigos de `CRITICAL_AREA_CODES`).
    const filas = [...bloque.matchAll(/^\('[A-Z_]+',/gm)];
    expect(filas).toHaveLength(10);
    for (const area of ["POOL_FILTER", "WATER_PUMP", "ELEVATOR", "ELECTRIC_GENERATOR"]) {
      expect(bloque, `${area} debe sembrarse como crítica`).toMatch(new RegExp(`\\('${area}',[^\\n]*TRUE`));
    }

    // Auditoría append-only (RNF-M-19).
    expect(bloque).toContain("CREATE OR REPLACE FUNCTION forbid_audit_mutation");
    expect(bloque).toContain("CREATE TRIGGER trg_operator_audit_append_only");
  });
});

describe("resetDatabase · desmonta también el esquema vNext", () => {
  it("borra las 12 tablas nuevas y vuelve a aplicar el esquema", async () => {
    const { pool, query } = fakePool();

    await resetDatabase(pool);

    expect(query).toHaveBeenCalledTimes(2);
    const drops = String(query.mock.calls[0]![0]);
    for (const tabla of [
      "damage_charge_guest_notifications",
      "housekeeping_damage_charges",
      "housekeeping_inspections",
      "supply_alerts",
      "maintenance_area_logs",
      "maintenance_area_tasks",
      "maintenance_areas",
      "maintenance_area_types",
      "operator_wallets",
      "terminal_operators",
      "on_chain_signatures",
      "operator_audit_log",
    ]) {
      expect(drops, `resetDatabase no borra ${tabla}`).toContain(`DROP TABLE IF EXISTS ${tabla} CASCADE`);
    }
    expect(query.mock.calls[1]![0]).toBe(INITIAL_SCHEMA_SQL);
  });
});

describe("sincronía triple de los artefactos de datos (P8)", () => {
  it("el bloque vNext es idéntico en el migrador, el script raíz y la propuesta aprobada", () => {
    const enMigrador = vnextBlock("packages/shared/src/db/migrator.ts");
    const enRaiz = vnextBlock("RepoTecnico/base_datos.sql");
    const enPropuesta = vnextBlock("RepoTecnico/propuesta_vNext/base_datos.sql");

    expect(enMigrador.length).toBeGreaterThan(5_000);
    expect(enRaiz, "el script raíz y el migrador divergen en el bloque vNext").toBe(enMigrador);
    expect(enPropuesta, "la propuesta aprobada y el migrador divergen en el bloque vNext").toBe(
      enMigrador,
    );
  });
});
