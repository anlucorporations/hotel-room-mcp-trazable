import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardián de **sincronización documental** (A12 · Fase 4, 2026-10-20).
 *
 * Cierra el matiz de A12: hasta ahora `base_datos.sql` (esquema físico ejecutable),
 * `diccionario_datos.md` y `diagrama_er.md` se mantenían sincronizados **a mano**. Ese trabajo manual
 * ya falló dos veces (las tablas de F4–F9 no llegaron a los dos documentos). Este guardián compara
 * los tres artefactos y falla ante cualquier deriva:
 *
 *   1. **Tablas**: toda tabla del esquema está en el diccionario y en el ER, y ninguno documenta una
 *      tabla que no exista.
 *   2. **Columnas**: toda columna del esquema (incluidas las añadidas por `ALTER TABLE … ADD COLUMN`)
 *      aparece documentada en el diccionario y en el ER.
 *   3. **Tipos del ER**: el tipo documentado en el diagrama coincide con el del esquema (normalizado).
 *   4. **Cabeceras**: el «Total: N tablas» de ambos documentos coincide con el esquema real.
 *
 * El esquema se lee de `RepoTecnico/base_datos.sql` (el artefacto que se aplica con `psql`); su paridad
 * con `migrator.ts` ya la vigila `architecture-guardian.test.ts`. Los tres artefactos son la fuente de
 * verdad del modelo, así que este test es el que impide que vuelvan a divergir.
 */
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, "..", "..", "..");
const readDoc = (name: string): string => readFileSync(join(REPO_ROOT, "RepoTecnico", name), "utf8");

const SQL_DOC = "base_datos.sql";
const DICTIONARY_DOC = "diccionario_datos.md";
const ER_DOC = "diagrama_er.md";

interface Column {
  readonly name: string;
  readonly type: string;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly references: string | null;
}

interface Table {
  readonly name: string;
  readonly columns: readonly Column[];
}

const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS\s+"?(\w+)"?\s*\(/gi;
const ADD_COLUMN = /ALTER TABLE\s+"?(\w+)"?\s+ADD COLUMN IF NOT EXISTS\s+"?([a-z_][a-z0-9_]*)"?\s+([A-Za-z_]+(?:\s*\([^)]*\))?)([^;]*);/gi;

/** Quita comentarios de línea respetando literales entre comillas simples. */
function stripLineComments(text: string): string {
  let out = "";
  let inString = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "'") {
      inString = !inString;
      out += char;
      index += 1;
      continue;
    }
    if (!inString && char === "-" && text[index + 1] === "-") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Separa por comas de primer nivel (respeta paréntesis de `NUMERIC(78, 0)` y `CHECK (...)`). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Índice del paréntesis de cierre que equilibra el de apertura. */
function matchingParen(sql: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    else if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Tablas y columnas del esquema físico, incluyendo los `ALTER TABLE … ADD COLUMN` incrementales. */
function parseSchema(sql: string): Map<string, Table> {
  const tables = new Map<string, Table>();
  for (const match of sql.matchAll(CREATE_TABLE)) {
    const tableName = (match[1] ?? "").toLowerCase();
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const closeIndex = matchingParen(sql, openIndex);
    if (closeIndex === -1) continue;
    const body = stripLineComments(sql.slice(openIndex + 1, closeIndex));
    const columns: Column[] = [];
    for (const raw of splitTopLevel(body)) {
      const line = raw.trim().replace(/\s+/g, " ");
      if (!line) continue;
      if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE|LIKE)\b/i.test(line)) continue;
      const column = /^"?([a-z_][a-z0-9_]*)"?\s+([A-Za-z_]+(?:\s*\([^)]*\))?)/i.exec(line);
      if (!column) continue;
      const rest = line.slice(column[0].length);
      const primaryKey = /PRIMARY\s+KEY/i.test(rest);
      const reference = /REFERENCES\s+"?(\w+)"?\s*\(([^)]+)\)/i.exec(rest);
      columns.push({
        name: (column[1] ?? "").toLowerCase(),
        type: (column[2] ?? "").replace(/\s+/g, "").toUpperCase(),
        primaryKey,
        unique: /UNIQUE/i.test(rest),
        references: reference ? `${reference[1] ?? ""}(${(reference[2] ?? "").trim()})` : null,
      });
    }
    tables.set(tableName, { name: tableName, columns });
  }

  for (const match of sql.matchAll(ADD_COLUMN)) {
    const tableName = (match[1] ?? "").toLowerCase();
    const table = tables.get(tableName);
    if (!table) continue;
    const columnName = (match[2] ?? "").toLowerCase();
    if (table.columns.some((column) => column.name === columnName)) continue;
    tables.set(tableName, {
      name: tableName,
      columns: [
        ...table.columns,
        {
          name: columnName,
          type: (match[3] ?? "").replace(/\s+/g, "").toUpperCase(),
          primaryKey: false,
          unique: false,
          references: null,
        },
      ],
    });
  }

  return tables;
}

const schema = parseSchema(readDoc(SQL_DOC));
const schemaTables = new Set(schema.keys());
const allColumnNames = new Set([...schema.values()].flatMap((table) => table.columns.map((column) => column.name)));

/**
 * Documentación del diccionario: se resuelve por **contextos**. Un contexto es una sección
 * (`###`/`####`) cuyo título nombra una o más tablas, o una línea al estilo «`tabla`: …» que
 * introduce la tabla en prosa. Las columnas documentadas son los identificadores entre backticks que
 * existan en el esquema (los nombres de valores, índices o funciones no cuentan).
 */
function parseDictionary(dictionary: string): Map<string, Set<string>> {
  const lines = dictionary.split("\n");
  interface Context {
    readonly tables: readonly string[];
    readonly start: number;
    end: number;
  }
  const contexts: Context[] = [];
  let current: Context | null = null;
  const headingPattern = /^#{3,4}\s+(.*)$/;
  const inlinePattern = /^`([a-z_][a-z0-9_]*)`:/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = headingPattern.exec(line);
    if (heading) {
      const tables = [...(heading[1] ?? "").matchAll(/`([a-z_][a-z0-9_]*)`/g)]
        .map((match) => (match[1] ?? "").toLowerCase())
        .filter((name) => schemaTables.has(name));
      if (current) current.end = index;
      current = tables.length > 0 ? { tables, start: index, end: lines.length } : null;
      if (current) contexts.push(current);
      continue;
    }
    const inline = inlinePattern.exec(line);
    if (inline && schemaTables.has((inline[1] ?? "").toLowerCase())) {
      if (current) current.end = index;
      current = { tables: [(inline[1] ?? "").toLowerCase()], start: index, end: lines.length };
      contexts.push(current);
    }
  }

  const documented = new Map<string, Set<string>>();
  for (const context of contexts) {
    const chunk = lines.slice(context.start, context.end).join("\n");
    // El diccionario escribe las columnas de dos formas: en celdas de tabla (`| \`col\` | … |`) y en
    // prosa dentro de backticks (`\`col VARCHAR(40)\``, `\`col\`/\`otra\``, `\`(room_id, code)\``).
    // Se aceptan todas: los identificadores en backticks que sean columnas de las tablas del
    // contexto. Así el guardián mide lo que el documento **documenta**, no un formato concreto.
    const identifiers = new Set<string>();
    for (const span of chunk.matchAll(/`([^`\n]+)`/g)) {
      for (const token of (span[1] ?? "").matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
        identifiers.add((token[1] ?? "").toLowerCase());
      }
    }
    for (const table of context.tables) {
      const set = documented.get(table) ?? new Set<string>();
      for (const column of identifiers) {
        if (allColumnNames.has(column) && (schema.get(table)?.columns.some((entry) => entry.name === column) ?? false)) {
          set.add(column);
        }
      }
      documented.set(table, set);
    }
  }
  return documented;
}

const normalizeType = (type: string): string => type.replace(/\s+/g, "").toUpperCase();

interface ErEntity {
  readonly columns: Map<string, string>;
}

/** Entidades y atributos de los bloques Mermaid `erDiagram` del diagrama. */
function parseEr(diagram: string): Map<string, ErEntity> {
  const entities = new Map<string, ErEntity>();
  for (const block of diagram.matchAll(/```mermaid([\s\S]*?)```/g)) {
    const content = block[1] ?? "";
    if (!/erDiagram/.test(content)) continue;
    for (const entity of content.matchAll(/(?:^|\n)\s{2,}([a-z_][a-z0-9_]*)\s*\{([\s\S]*?)\n\s{2,}\}/g)) {
      const name = (entity[1] ?? "").toLowerCase();
      const columns = entities.get(name)?.columns ?? new Map<string, string>();
      for (const line of (entity[2] ?? "").split("\n")) {
        const attribute = /^\s*([A-Za-z_]+(?:\([^)]*\))?)\s+([a-z_][a-z0-9_]*)(?:\s+PK|\s+FK|\s+UK|\s+PK\s+FK)?(?:\s|$)/.exec(line);
        if (!attribute) continue;
        columns.set((attribute[2] ?? "").toLowerCase(), normalizeType(attribute[1] ?? ""));
      }
      entities.set(name, { columns });
    }
  }
  return entities;
}

const dictionary = parseDictionary(readDoc(DICTIONARY_DOC));
const er = parseEr(readDoc(ER_DOC));

describe("guardián de sincronización documental (A12 · Fase 4)", () => {
  it("el esquema físico tiene tablas y columnas (el parser no está ciego)", () => {
    expect(schemaTables.size).toBeGreaterThan(50);
    expect(allColumnNames.size).toBeGreaterThan(250);
  });

  it("toda tabla del esquema está documentada en diccionario y ER, sin tablas fantasma", () => {
    const missingInDictionary = [...schemaTables].filter((table) => !dictionary.has(table)).sort();
    const missingInEr = [...schemaTables].filter((table) => !er.has(table)).sort();
    const phantomInDictionary = [...dictionary.keys()].filter((table) => !schemaTables.has(table)).sort();
    const phantomInEr = [...er.keys()].filter((table) => !schemaTables.has(table)).sort();

    expect(missingInDictionary, `tablas sin documentar en ${DICTIONARY_DOC}: ${missingInDictionary.join(", ")}`).toEqual([]);
    expect(missingInEr, `tablas sin entidad en ${ER_DOC}: ${missingInEr.join(", ")}`).toEqual([]);
    expect(phantomInDictionary, `tablas documentadas que no existen en ${SQL_DOC}: ${phantomInDictionary.join(", ")}`).toEqual([]);
    expect(phantomInEr, `entidades del ER que no existen en ${SQL_DOC}: ${phantomInEr.join(", ")}`).toEqual([]);
  });

  it("toda columna del esquema está documentada en el diccionario", () => {
    const missing: string[] = [];
    for (const [tableName, table] of schema) {
      const documented = dictionary.get(tableName);
      if (!documented) continue;
      for (const column of table.columns) {
        if (!documented.has(column.name)) missing.push(`${tableName}.${column.name}`);
      }
    }
    expect(missing, `columnas sin documentar en ${DICTIONARY_DOC}: ${missing.slice(0, 40).join(", ")}${missing.length > 40 ? ` … (+${missing.length - 40})` : ""}`).toEqual([]);
  });

  it("toda columna del esquema está en el ER y con el mismo tipo", () => {
    const missing: string[] = [];
    const typeMismatches: string[] = [];
    for (const [tableName, table] of schema) {
      const entity = er.get(tableName);
      if (!entity) continue;
      for (const column of table.columns) {
        const documentedType = entity.columns.get(column.name);
        if (!documentedType) {
          missing.push(`${tableName}.${column.name}`);
          continue;
        }
        if (documentedType !== normalizeType(column.type)) {
          typeMismatches.push(`${tableName}.${column.name}: esquema=${column.type} ER=${documentedType}`);
        }
      }
    }
    expect(missing, `columnas sin documentar en ${ER_DOC}: ${missing.slice(0, 40).join(", ")}${missing.length > 40 ? ` … (+${missing.length - 40})` : ""}`).toEqual([]);
    expect(typeMismatches, `tipos divergentes en ${ER_DOC}: ${typeMismatches.slice(0, 40).join(" | ")}`).toEqual([]);
  });

  it("las cabeceras declaran el número real de tablas", () => {
    const expected = schemaTables.size;
    for (const [file, text] of [
      [DICTIONARY_DOC, readDoc(DICTIONARY_DOC)],
      [ER_DOC, readDoc(ER_DOC)],
    ] as const) {
      const header = /Total:\s*\*{0,2}\s*(\d+)\s+tablas/i.exec(text);
      expect(header, `${file} no declara «Total: **N tablas**»`).not.toBeNull();
      expect(Number(header?.[1]), `${file} declara un total de tablas distinto del esquema`).toBe(expected);
    }
  });
});
