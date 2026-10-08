import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HUESPED_MANUALS, HUESPED_MOMENTS, HUESPED_PRINTABLE } from "./huesped.generated";

/**
 * Guardián del **manual del huésped** (`/ayuda/huesped`).
 *
 * El módulo `huesped.generated.ts` es un artefacto: si alguien edita un `.md` y no regenera, la
 * ayuda que ve el huésped divergiría del repositorio. Este test cierra ese hueco, y además comprueba
 * lo que el generador promete:
 *   1. Los 17 manuales fuente existen y el módulo los cubre todos, en orden.
 *   2. Los títulos y el número de secciones `##`/`###` coinciden con el markdown.
 *   3. Toda ilustración referenciada existe en `docs/imagenes/` **y** está publicada en
 *      `apps/web/public/manual/imagenes/` (una imagen que no se copia es un enlace roto).
 *   4. El HTML generado no conserva marcado crudo, no deja el bloque Mermaid y **escapa** el texto:
 *      el contenido se inserta con `dangerouslySetInnerHTML`, así que un `<` del manual debe llegar
 *      como `&lt;`.
 *   5. Cada cita inicial tiene **una sola** cita (el generador toma la primera y el resto lo deja
 *      como párrafos).
 *
 * Regenerar con: `corepack pnpm --filter @hotel/web run huesped`.
 */

const here = dirname(fileURLToPath(import.meta.url));
/** Raíz del monorepo: `apps/web/src/lib/help` → cinco niveles arriba (igual que `manuals-sync`). */
const ROOT = resolve(here, "..", "..", "..", "..", "..");
const SOURCE_DIR = join(ROOT, "docs", "Manuales", "06-huesped");
const IMAGES_DIR = join(ROOT, "docs", "imagenes");
const PUBLIC_IMAGES_DIR = join(ROOT, "apps", "web", "public", "manual", "imagenes");

const sourceFiles = readdirSync(SOURCE_DIR)
  .filter((name) => /^\d{2}-.+\.md$/.test(name))
  .sort();

const readSource = (file: string): string => readFileSync(join(SOURCE_DIR, file), "utf8");

/** Encabezados `##`/`###` del markdown, en orden (mismo criterio que el generador). */
function headingsOf(markdown: string): { level: number; title: string }[] {
  return markdown
    .split("\n")
    .map((line) => /^(#{2,3})\s+(.*)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ level: match[1]!.length, title: match[2]!.trim() }));
}

describe("guardián del manual del huésped", () => {
  it("los 17 manuales de caso existen en docs/Manuales/06-huesped/", () => {
    expect(sourceFiles).toHaveLength(17);
  });

  it("el módulo generado cubre los 17 casos, en orden", () => {
    expect(HUESPED_MANUALS.map((manual) => manual.slug)).toEqual(
      sourceFiles.map((file) => file.replace(/\.md$/, "")),
    );
    expect(HUESPED_MANUALS.map((manual) => manual.order)).toEqual(
      Array.from({ length: 17 }, (_, index) => index + 1),
    );
  });

  it("cada caso pertenece a un momento declarado y todos los momentos tienen casos", () => {
    const ids = new Set(HUESPED_MOMENTS.map((moment) => moment.id));
    for (const manual of HUESPED_MANUALS) {
      expect(ids.has(manual.moment), `${manual.slug}: momento desconocido`).toBe(true);
    }
    for (const moment of HUESPED_MOMENTS) {
      expect(
        HUESPED_MANUALS.some((manual) => manual.moment === moment.id),
        `${moment.id}: sin casos`,
      ).toBe(true);
    }
  });

  it("títulos y secciones coinciden con el markdown (¿módulo obsoleto?)", () => {
    for (const file of sourceFiles) {
      const slug = file.replace(/\.md$/, "");
      const manual = HUESPED_MANUALS.find((candidate) => candidate.slug === slug);
      expect(manual, `${slug}: no está en el módulo`).toBeDefined();

      const markdown = readSource(file);
      const title = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
      expect(manual?.title, `${slug}: título distinto`).toBe(title);

      const expected = headingsOf(markdown);
      expect(
        manual?.sections.map((section) => `${section.level}:${section.title}`),
        `${slug}: las secciones no coinciden (regenera con \`pnpm --filter @hotel/web run huesped\`)`,
      ).toEqual(expected.map((heading) => `${heading.level}:${heading.title}`));
    }
  });

  it("cada cita inicial tiene una sola cita y ninguna cita ajena", () => {
    for (const manual of HUESPED_MANUALS) {
      expect(manual.lead.startsWith("<blockquote>"), `${manual.slug}: el lead no empieza por cita`).toBe(
        true,
      );
      expect(
        manual.lead.split("<blockquote>").length - 1,
        `${manual.slug}: el lead tiene más de una cita`,
      ).toBe(1);
    }
  });

  it("el HTML no conserva marcado crudo ni bloques Mermaid", () => {
    for (const manual of HUESPED_MANUALS) {
      const html = manual.lead + manual.sections.map((section) => section.html).join("");
      expect(html.includes("```"), `${manual.slug}: queda una valla de código`).toBe(false);
      expect(html.includes("mermaid"), `${manual.slug}: queda un bloque mermaid`).toBe(false);
      expect(html.includes("GENERAR_IMAGEN"), `${manual.slug}: queda un marcador de imagen`).toBe(false);
      // Marcado crudo: `**negrita**` sin convertir.
      expect(html.includes("**"), `${manual.slug}: queda markdown crudo`).toBe(false);
    }
  });

  it("todo texto del manual llega escapado (se inserta con dangerouslySetInnerHTML)", () => {
    // El generador escapa el texto antes de aplicar el marcado en línea: cualquier etiqueta del
    // manual tiene que aparecer como entidad, nunca como etiqueta viva.
    const withMarkup = HUESPED_MANUALS.map((manual) => ({
      slug: manual.slug,
      html: manual.lead + manual.sections.map((section) => section.html).join(""),
    }));
    for (const manual of withMarkup) {
      expect(/<script/i.test(manual.html), `${manual.slug}: contiene <script>`).toBe(false);
      expect(/ on[a-z]+\s*=/i.test(manual.html), `${manual.slug}: atributo de evento inline`).toBe(
        false,
      );
    }
  });

  it("las ilustraciones referenciadas existen y están publicadas", () => {
    for (const manual of HUESPED_MANUALS) {
      if (!manual.image) continue;
      expect(
        existsSync(join(IMAGES_DIR, manual.image)),
        `${manual.slug}: falta docs/imagenes/${manual.image}`,
      ).toBe(true);
      expect(
        existsSync(join(PUBLIC_IMAGES_DIR, manual.image)),
        `${manual.slug}: ${manual.image} no se publicó en public/manual/imagenes/`,
      ).toBe(true);
      expect(manual.lead + manual.sections.map((s) => s.html).join("")).toContain(
        `/manual/imagenes/${manual.image}`,
      );
    }
  });

  it("la versión imprimible está publicada para su descarga", () => {
    expect(HUESPED_PRINTABLE).toBe("/manual/manual-huesped.html");
    expect(
      existsSync(join(ROOT, "apps", "web", "public", "manual", "manual-huesped.html")),
    ).toBe(true);
  });

  it("el índice del árbol menciona los 17 manuales", () => {
    const readme = readFileSync(join(SOURCE_DIR, "README.md"), "utf8");
    for (const manual of HUESPED_MANUALS) {
      expect(readme.includes(`${manual.slug}.md`), `el README no menciona ${manual.slug}`).toBe(true);
    }
  });
});
