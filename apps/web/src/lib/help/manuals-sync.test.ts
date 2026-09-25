import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MANUALS } from "./manuals.generated";
import { findListProblems } from "./list-structure.mjs";

/**
 * Guardián de sincronía de los manuales (Ayuda).
 *
 * `manuals.generated.ts` lo produce `apps/web/scripts/build-manuals.mjs` a partir de los manuales
 * literales de `docs/`. Como es un artefacto generado y versionado, puede quedarse obsoleto en
 * cuanto alguien edite un manual y no vuelva a ejecutar `pnpm --filter @hotel/web run manuals`.
 * Esta prueba cierra esa brecha: es el invariante que garantiza que el módulo que consume la
 * sección de Ayuda sigue reflejando los ficheros `.md` reales.
 *
 * Qué comprueba (sin Playwright ni red: solo lectura de ficheros):
 *   1. Los tres manuales fuente existen.
 *   2. `MANUALS` cubre los tres slugs, en orden, con `slug`/`title`/`lead`/`pdf` no vacíos.
 *   3. TODOS los títulos `##` del markdown aparecen en `MANUALS`, en orden y con el mismo número
 *      de secciones `##` y `###`.
 *   4. El `html` de cada sección no contiene markdown sin convertir (`**`, `|…|`, enlaces, anclas,
 *      encabezados) y no repite el encabezado de la sección (lo pinta el componente).
 *   5. Los `id` de ancla son legibles, únicos dentro del documento y las rutas de imagen/PDF son
 *      las que sirve la carpeta pública de la web.
 */

const here = dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo: `apps/web/src/lib/help` → cinco niveles arriba. */
const ROOT = resolve(here, "..", "..", "..", "..", "..");
const DOCS = join(ROOT, "docs");

/** Espejo de `SOURCES` de `apps/web/scripts/build-manuals.mjs`. */
const SOURCES = [
  { slug: "cliente", file: "manual-cliente.md" },
  { slug: "comprador", file: "manual-comprador.md" },
  { slug: "recepcion", file: "manual-recepcion.md" },
];

/** Títulos de encabezado del manual, con su nivel y su texto (sin el prefijo `#`). */
function headingsOf(markdown: string): Array<{ level: number; title: string }> {
  const headings: Array<{ level: number; title: string }> = [];
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!match) continue;
    headings.push({ level: match[1]?.length ?? 0, title: (match[2] ?? "").trim() });
  }
  return headings;
}

/** Título H1 del manual (el que usa `ManualDoc.title`). */
function titleOf(markdown: string): string {
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^#\s+(.*)$/.exec(line);
    if (match) return (match[1] ?? "").trim();
  }
  return "";
}

const manuals = SOURCES.map((source) => ({
  ...source,
  path: join(DOCS, source.file),
  markdown: existsSync(join(DOCS, source.file)) ? readFileSync(join(DOCS, source.file), "utf8") : "",
}));

describe("guardián de manuales generados (Ayuda)", () => {
  it("los tres manuales fuente existen en docs/", () => {
    const missing = manuals.filter((manual) => !existsSync(manual.path)).map((manual) => manual.file);
    expect(missing, `faltan manuales literales en docs/: ${missing.join(", ")}`).toEqual([]);
  });

  it("MANUALS cubre los tres slugs con sus campos obligatorios", () => {
    expect(MANUALS.map((doc) => doc.slug)).toEqual(SOURCES.map((source) => source.slug));

    for (const doc of MANUALS) {
      expect(doc.title.trim(), `${doc.slug}: title vacío`).not.toBe("");
      expect(doc.lead.trim(), `${doc.slug}: lead vacío`).not.toBe("");
      expect(doc.pdf, `${doc.slug}: pdf inesperado`).toBe(`/manual/manual-${doc.slug}.pdf`);
      expect(doc.sections.length, `${doc.slug}: sin secciones`).toBeGreaterThan(0);
    }

    // El lead es TODO el preámbulo ya convertido a HTML (la cita inicial y el resto de bloques, en
    // los manuales actuales la ilustración de portada): sin markdown crudo y con una sola cita.
    for (const doc of MANUALS) {
      expect(doc.lead.startsWith("<blockquote>"), `${doc.slug}: el lead no empieza por la cita`).toBe(
        true,
      );
      expect(
        doc.lead.split("<blockquote>").length - 1,
        `${doc.slug}: la cita del lead aparece más de una vez`,
      ).toBe(1);
      expect(doc.lead.includes("**"), `${doc.slug}: el lead conserva markdown crudo`).toBe(false);
    }
  });

  it("todo título ## y ### del markdown aparece en MANUALS (mismo número de secciones)", () => {
    for (const manual of manuals) {
      const doc = MANUALS.find((candidate) => candidate.slug === manual.slug);
      expect(doc, `${manual.slug}: no está en MANUALS`).toBeDefined();

      const expected = headingsOf(manual.markdown);
      const level2 = expected.filter((heading) => heading.level === 2);
      const level3 = expected.filter((heading) => heading.level === 3);

      expect(
        doc?.sections.filter((section) => section.level === 2).length,
        `${manual.file}: número de secciones ## distinto`,
      ).toBe(level2.length);
      expect(
        doc?.sections.filter((section) => section.level === 3).length,
        `${manual.file}: número de subsecciones ### distinto`,
      ).toBe(level3.length);

      // Mismo orden y mismos títulos, nivel a nivel.
      expect(
        doc?.sections.map((section) => `${section.level}:${section.title}`),
        `${manual.file}: los títulos generados no coinciden con el markdown ` +
          `(¿módulo obsoleto? ejecuta \`pnpm --filter @hotel/web run manuals\`)`,
      ).toEqual(expected.map((heading) => `${heading.level}:${heading.title}`));

      expect(doc?.title.trim(), `${manual.file}: el H1 no coincide`).toBe(titleOf(manual.markdown));
    }
  });

  it("ninguna sección conserva markdown sin convertir en su html", () => {
    const offenders: string[] = [];

    for (const doc of MANUALS) {
      for (const [index, section] of doc.sections.entries()) {
        const html = section.html;
        const where = `${doc.slug}#${section.id}`;

        // Una sección `##` que solo agrupa subsecciones `###` puede no tener cuerpo propio
        // (así ocurre en «3. Escanear un resguardo, paso a paso»); el resto debe tener contenido.
        const groupsSubsections =
          section.level === 2 && doc.sections[index + 1]?.level === 3;
        if (!groupsSubsections) {
          expect(html.trim(), `${where}: html vacío`).not.toBe("");
        }

        if (html.includes("**")) offenders.push(`${where}: negrita sin convertir (**)`);
        if (/(^|\n)\s*\|/.test(html)) offenders.push(`${where}: fila de tabla cruda (|)`);
        if (/\[[^\]]+\]\([^)]+\)/.test(html)) offenders.push(`${where}: enlace markdown sin convertir`);
        if (/(^|\n)#{1,6}\s/.test(html)) offenders.push(`${where}: encabezado markdown sin convertir`);
        if (/<\/?h[1-6][\s>]/.test(html)) offenders.push(`${where}: el html incluye su propio encabezado`);
        if (html.includes("\u0000")) offenders.push(`${where}: marcador interno sin resolver`);
      }
    }

    expect(
      offenders,
      `Estas secciones del módulo generado tienen markdown crudo. Ejecuta ` +
        `\`pnpm --filter @hotel/web run manuals\`:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("los id de ancla son legibles y únicos, y las rutas apuntan a la carpeta pública", () => {
    for (const doc of MANUALS) {
      const ids = doc.sections.map((section) => section.id);
      expect(new Set(ids).size, `${doc.slug}: hay id de ancla duplicados`).toBe(ids.length);

      for (const id of ids) {
        expect(id, `id de ancla no legible en ${doc.slug}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }

      // Los `##` numerados conservan su número como prefijo del ancla.
      const numbered = doc.sections.filter((section) => /^\d+\.\s/.test(section.title));
      expect(numbered.length, `${doc.slug}: sin secciones numeradas`).toBeGreaterThan(0);
      for (const section of numbered) {
        const expectedPrefix = `${/^(\d+)/.exec(section.title)?.[1]}-`;
        expect(section.id.startsWith(expectedPrefix), `${doc.slug}: ancla sin número (${section.id})`).toBe(
          true,
        );
      }
    }
  });

  it("toda imagen del markdown llega al módulo, con su recuento y su ruta pública", () => {
    for (const manual of manuals) {
      const doc = MANUALS.find((candidate) => candidate.slug === manual.slug);
      expect(doc, `${manual.slug}: no está en MANUALS`).toBeDefined();

      // Imágenes referenciadas en el `.md`: `![alt](imagenes/x.svg)` (incluidas las del preámbulo).
      const referenced = [...manual.markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) =>
        (match[1] ?? "").split(/[\\/]/).pop() ?? "",
      );
      expect(referenced.length, `${manual.file}: el markdown no referencia ninguna imagen`).toBeGreaterThan(
        0,
      );

      // El módulo no puede perder ninguna: ni las del preámbulo (`lead`) ni las de las secciones.
      const html = [doc?.lead ?? "", ...(doc?.sections ?? []).map((section) => section.html)].join("\n");
      const rendered = [...html.matchAll(/<img\s+src="\/manual\/imagenes\/([^"]+)"/g)].map(
        (match) => match[1] ?? "",
      );

      expect(
        rendered.length,
        `${manual.file}: imágenes en el markdown = ${referenced.length} y en el módulo = ` +
          `${rendered.length} (¿se perdió el preámbulo? ejecuta ` +
          `\`pnpm --filter @hotel/web run manuals\`)`,
      ).toBe(referenced.length);

      // Mismo recuento por fichero de imagen, no solo el total.
      const countByFile = (list: readonly string[]): Map<string, number> => {
        const map = new Map<string, number>();
        for (const name of list) map.set(name, (map.get(name) ?? 0) + 1);
        return map;
      };
      expect(Object.fromEntries(countByFile(rendered))).toEqual(
        Object.fromEntries(countByFile(referenced)),
      );

      // La ilustración de portada es del PREÁMBULO: debe estar en `lead`, una sola vez.
      const portada = referenced.find((name) => name.startsWith("portada-"));
      expect(portada, `${manual.file}: sin imagen de portada en el preámbulo`).toBeDefined();
      const inLead = [
        ...(doc?.lead ?? "").matchAll(/<img\s+src="\/manual\/imagenes\/([^"]+)"/g),
      ].filter((match) => match[1] === portada);
      expect(inLead.length, `${manual.file}: la portada no está (o está repetida) en lead`).toBe(1);
      expect(
        (doc?.lead ?? "").split(`/manual/imagenes/${portada}`).length - 1,
        `${manual.file}: la portada del lead aparece más de una vez`,
      ).toBe(1);
    }
  });

  it("las listas del html están bien formadas (invariantes de las reglas `list`/`listitem` de axe)", () => {
    const offenders: string[] = [];

    for (const doc of MANUALS) {
      const blocks: Array<[string, string]> = [
        [`${doc.slug}#lead`, doc.lead],
        ...doc.sections.map(
          (section) => [`${doc.slug}#${section.id}`, section.html] as [string, string],
        ),
      ];

      for (const [where, html] of blocks) {
        for (const problem of findListProblems(html)) offenders.push(`${where}: ${problem}`);
      }

      // Recuento global del documento: un `<li>` no puede quedar fuera de su lista ni perderse.
      const document = [doc.lead, ...doc.sections.map((section) => section.html)].join("\n");
      for (const problem of findListProblems(document)) offenders.push(`${doc.slug}: ${problem}`);

      // Cada lista declarada tiene sus puntos: si el conversor pierde el contenedor, aquí se ve.
      const lists = (document.match(/<ul>|<ol>/g) ?? []).length;
      const items = (document.match(/<li>/g) ?? []).length;
      expect(items, `${doc.slug}: hay <li> sin ninguna lista contenedora`).toBeGreaterThanOrEqual(lists);
    }

    expect(
      offenders,
      `El HTML generado tiene listas mal formadas (axe fallará con \`list\`/\`listitem\`). ` +
        `Ejecuta \`pnpm --filter @hotel/web run manuals\`:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("las imágenes del html usan la ruta pública /manual/imagenes/", () => {
    for (const doc of MANUALS) {
      const html = [doc.lead, ...doc.sections.map((section) => section.html)].join("\n");
      for (const match of html.matchAll(/<img\s+src="([^"]+)"/g)) {
        expect(match[1], `${doc.slug}: ruta de imagen no pública (${match[1]})`).toMatch(
          /^\/manual\/imagenes\/[A-Za-z0-9._-]+\.(svg|png)$/,
        );
      }
      // Cualquier `src="../imagenes/…"` sería la ruta del HTML imprimible: no debe llegar a la web.
      expect(/\.\.\/imagenes\//.test(html), `${doc.slug}: ruta relativa de docs/pdf en el módulo`).toBe(
        false,
      );
    }
  });
});
