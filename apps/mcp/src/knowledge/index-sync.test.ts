import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_CHUNKS } from "./index.generated";

/**
 * Guardián de **sincronía del índice de conocimiento** del MCP.
 *
 * `index.generated.ts` es un artefacto: si alguien edita un manual de `docs/` y no ejecuta
 * `corepack pnpm --filter @hotel/mcp run knowledge`, el asistente respondería con contenido
 * obsoleto **en silencio**. Los otros dos artefactos generados del repositorio
 * (`manuals.generated.ts`, `huesped.generated.ts`) ya tienen su guardián; este cierra el hueco del
 * tercero.
 *
 * Comprueba, contra los ficheros reales de `docs/`:
 *   1. Todo `source` citado por un fragmento existe (nada indexado que ya no esté).
 *   2. Toda fuente indexable está representada (nada nuevo sin indexar).
 *   3. El `docTitle` de cada fuente coincide con su `H1` y su conjunto de secciones `##`/`###`
 *      coincide con el del markdown (detecta añadir, renombrar o borrar secciones).
 *   4. El índice no contiene documentación interna (decisión de seguridad de H2: el MCP es público).
 */

const here = dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo: `apps/mcp/src/knowledge` → cuatro niveles arriba. */
const ROOT = resolve(here, "..", "..", "..", "..");

/** Los tres manuales dirigidos a personas (mismo mapeo que el generador). */
const DOC_SOURCES = ["docs/manual-cliente.md", "docs/manual-comprador.md", "docs/manual-recepcion.md"];
/** Casos del huésped: un fichero por caso, todos indexables. */
const GUEST_DIR = "docs/Manuales/06-huesped";

const readIfExists = (relative: string): string | null => {
  const path = join(ROOT, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

/**
 * Secciones `##`/`###` del markdown que el generador **indexa**: las que tienen texto propio.
 *
 * Un `##` que solo sirve de contenedor de subsecciones (como «3. Escanear un resguardo, paso a
 * paso», cuyo contenido está en sus `###`) no genera fragmento: no hay texto que buscar. Se
 * reproducen aquí las mismas supresiones que hace el generador (comentarios, vallas e imágenes).
 */
function indexableHeadingsOf(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => /^#{2,3}\s+\S/.test(entry.line));

  const out: string[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i]!.index + 1;
    const end = i + 1 < headings.length ? headings[i + 1]!.index : lines.length;
    const body = lines
      .slice(start, end)
      .join("\n")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim();
    if (body.length > 0) out.push(headings[i]!.line.replace(/^#{2,3}\s+/, "").trim());
  }
  return out;
}

const titleOf = (markdown: string): string | undefined =>
  /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();

const guestFiles = existsSync(join(ROOT, GUEST_DIR))
  ? readdirSync(join(ROOT, GUEST_DIR))
      .filter((name) => /^\d{2}-.+\.md$/.test(name))
      .sort()
      .map((name) => `${GUEST_DIR}/${name}`)
  : [];

const INDEXED_SOURCES = [...DOC_SOURCES, ...guestFiles];

/** Fragmentos por fichero fuente, sin la portada (que no es una sección del markdown). */
const bySource = new Map<string, typeof KNOWLEDGE_CHUNKS>();
for (const chunk of KNOWLEDGE_CHUNKS) {
  const list = bySource.get(chunk.source) ?? [];
  bySource.set(chunk.source, [...list, chunk]);
}

describe("guardián de sincronía del índice de conocimiento", () => {
  it("está poblado y solo cita fuentes que existen", () => {
    expect(KNOWLEDGE_CHUNKS.length).toBeGreaterThan(100);
    const missing = [...bySource.keys()].filter((source) => !existsSync(join(ROOT, source)));
    expect(missing, `fuentes indexadas que ya no existen: ${missing.join(", ")}`).toEqual([]);
  });

  it("todas las fuentes indexables están en el índice", () => {
    const indexed = new Set(bySource.keys());
    const absent = INDEXED_SOURCES.filter((source) => !indexed.has(source));
    expect(
      absent,
      `hay manuales sin indexar (¿falta ejecutar \`pnpm --filter @hotel/mcp run knowledge\`?): ` +
        absent.join(", "),
    ).toEqual([]);
  });

  it("título y secciones de cada fuente coinciden con su markdown", () => {
    for (const source of INDEXED_SOURCES) {
      const markdown = readIfExists(source);
      if (!markdown) continue;
      const chunks = bySource.get(source);
      expect(chunks, `${source}: sin fragmentos`).toBeDefined();

      const titles = new Set(chunks.map((chunk) => chunk.docTitle));
      expect([...titles], `${source}: el título del índice no coincide con el H1`).toEqual([
        titleOf(markdown),
      ]);

      const indexedSections = new Set(
        chunks.filter((chunk) => !chunk.id.endsWith("#portada")).map((chunk) => chunk.section),
      );
      const expectedSections = new Set(indexableHeadingsOf(markdown));
      expect(
        [...indexedSections].sort(),
        `${source}: las secciones no coinciden con el markdown ` +
          `(regenera con \`pnpm --filter @hotel/mcp run knowledge\`)`,
      ).toEqual([...expectedSections].sort());
    }
  });

  it("no indexa documentación interna (el MCP es público)", () => {
    const internal = KNOWLEDGE_CHUNKS.filter(
      (chunk) => chunk.audience === "interno" || chunk.source.includes("RepoTecnico"),
    );
    expect(internal).toEqual([]);
  });

  it("las audiencias están dentro del vocabulario cerrado", () => {
    const vocabulary = ["cliente", "propietario", "recepcion", "interno"];
    const audiences = new Set(KNOWLEDGE_CHUNKS.map((chunk) => chunk.audience));
    for (const audience of audiences) expect(vocabulary).toContain(audience);
    // El índice del servicio no tiene contenido interno (ver el test anterior).
    expect(audiences.has("interno")).toBe(false);
  });
});
