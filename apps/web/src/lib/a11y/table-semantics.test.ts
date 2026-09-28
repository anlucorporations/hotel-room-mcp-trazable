import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **semántica de tablas** (propuesta de imagen visual · Fase C.3).
 *
 * Una tabla sin nombre ni encabezados obliga a quien usa lector de pantalla a adivinar qué está
 * mirando y qué significa cada celda. El proyecto tenía tablas correctas y tablas a medias: en la
 * Fase C.3 se midió que **6 de 13** no declaraban `<caption>`.
 *
 * La regla se **deriva del código real** (todos los `<table>` del producto), no de una lista fija, de
 * modo que una tabla nueva entra automáticamente en la comprobación:
 *   1. Toda tabla debe tener **nombre accesible**: `<caption>` o `aria-label` en la propia etiqueta.
 *   2. Toda tabla debe declarar al menos un `scope="col"`.
 *   3. Las tablas de **presentación** (`role="presentation"`, que no son datos) quedan exentas.
 */

const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(full) && !/\.test\.tsx?$/.test(full)) files.push(full);
    }
  };
  walk(SRC_ROOT);
  return files.sort();
}

interface TableSource {
  readonly file: string;
  readonly tag: string;
  readonly body: string;
}

/** Tablas del producto con la etiqueta de apertura y el cuerpo hasta su cierre. */
function tables(): TableSource[] {
  const found: TableSource[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/<table\b[^>]*>/g)) {
      const start = match.index ?? 0;
      const end = src.indexOf("</table>", start);
      found.push({
        file: relative(SRC_ROOT, file).replace(/\\/g, "/"),
        tag: match[0],
        body: end === -1 ? src.slice(start) : src.slice(start, end),
      });
    }
  }
  return found;
}

const ALL_TABLES = tables();

describe("Accesibilidad · semántica de las tablas de datos", () => {
  it("el guardián no está vacío: hay tablas de verdad en el producto", () => {
    expect(ALL_TABLES.length).toBeGreaterThan(8);
  });

  it("toda tabla de datos tiene nombre accesible (`<caption>` o `aria-label`)", () => {
    const unnamed = ALL_TABLES.filter(
      (table) => !table.tag.includes("role=\"presentation\"") && !table.body.includes("<caption"),
    ).map((table) => `${table.file} :: ${table.tag.slice(0, 60)}`);
    expect(unnamed).toEqual([]);
  });

  it("toda tabla de datos declara encabezados de columna con `scope`", () => {
    const withoutScope = ALL_TABLES.filter(
      (table) => !table.tag.includes("role=\"presentation\"") && !table.body.includes("scope=\"col\""),
    ).map((table) => table.file);
    expect(withoutScope).toEqual([]);
  });

  it("la tabla de personal (`DataTable`) declara caption, columna y fila", () => {
    const dataTable = readFileSync(join(SRC_ROOT, "components/ui/DataTable.tsx"), "utf8");
    expect(dataTable).toContain("<caption");
    expect(dataTable).toContain('scope="col"');
    expect(dataTable).toContain('scope="row"');
    // El contenedor desplazable es una región con nombre y alcanzable por teclado (WCAG 2.1.1).
    expect(dataTable).toContain('role="region"');
    expect(dataTable).toContain("tabIndex={0}");
  });

  it("las pantallas de personal que migran a `DataTable` ya no pintan tablas a mano", () => {
    // Si vuelve a aparecer un `<table>` suelto en estas pantallas, se pierde la comprobación de fila
    // (`scope="row"`), el nombre accesible y la región desplazable.
    for (const path of ["components/admin/maintenance/IncidentsAdmin.tsx"]) {
      const src = readFileSync(join(SRC_ROOT, path), "utf8");
      expect(src, path).not.toContain("<table");
      expect(src, path).toContain("DataTable");
    }
  });
});
