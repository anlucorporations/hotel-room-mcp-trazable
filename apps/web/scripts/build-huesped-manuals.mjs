/* eslint-disable no-console */
/**
 * build-huesped-manuals.mjs — Manual del huésped para la plataforma (rol INTEGRADOR del equipo de
 * manuales, 2026-10-07).
 *
 * POR QUÉ UN GENERADOR PROPIO Y NO `build-manuals.mjs`
 * ---------------------------------------------------
 * La tubería general (`apps/web/scripts/build-manuals.mjs`) es la fuente única de los manuales de
 * cliente/comprador/recepción y de los casos de uso, pero **hoy está rota** y no se toca aquí:
 *   · aborta porque CU-38 y CU-39 no están declarados en `CU_ORDER`;
 *   · CU-39 tiene dos citas en el preámbulo y CU-38 ninguna ilustración, así que
 *     `manuals-sync.test.ts` los rechaza (y CU-38/39 no son documentos de este encargo).
 * Además esa tubería impone una política de formato (una sola cita y al menos una imagen por manual)
 * que los 17 manuales de caso del huésped no siguen: son guías cortas y solo 6 llevan ilustración.
 *
 * Este generador produce un módulo propio para la sección /ayuda/huesped, con la MISMA forma que
 * `manuals.generated.ts` para poder reutilizar el CSS de `ayuda/manual.module.css`, y copia a
 * `public/manual/` las ilustraciones y la versión imprimible.
 *
 * SEGURIDAD: todo el texto de los `.md` se **escapa** antes de aplicar el marcado en línea; el HTML
 * resultante se inserta con `dangerouslySetInnerHTML`, igual que la ayuda existente. Las imágenes se
 * validan contra el disco: una referencia que no exista **falla el build** en lugar de dejar un
 * enlace roto.
 *
 * Uso:
 *   corepack pnpm --filter @hotel/web run huesped
 *   node apps/web/scripts/build-huesped-manuals.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const WEB_ROOT = resolve(HERE, ".."); // apps/web
const PROJECT_ROOT = resolve(WEB_ROOT, "..", ".."); // raíz del monorepo

const SOURCE_DIR = join(PROJECT_ROOT, "docs", "Manuales", "06-huesped");
const IMAGES_DIR = join(PROJECT_ROOT, "docs", "imagenes");
const PRINTABLE_HTML = join(PROJECT_ROOT, "docs", "pdf", "huesped", "manual-huesped.html");

const GENERATED_TS = join(WEB_ROOT, "src", "lib", "help", "huesped.generated.ts");
const PUBLIC_MANUAL_DIR = join(WEB_ROOT, "public", "manual");
const PUBLIC_IMAGES_DIR = join(PUBLIC_MANUAL_DIR, "imagenes");

/** Momentos del viaje: agrupan los casos en el índice (mismo agrupado que el README del árbol). */
const MOMENTS = [
  { id: "antes-de-llegar", label: "Antes de llegar", from: 1, to: 2 },
  { id: "conseguir-tu-noche", label: "Conseguir tu noche", from: 3, to: 7 },
  { id: "si-te-sobra-la-noche", label: "Si te sobra la noche", from: 8, to: 9 },
  { id: "durante-la-estancia", label: "Durante la estancia", from: 10, to: 12 },
  { id: "despues", label: "Después", from: 13, to: 16 },
  { id: "cuando-algo-va-mal", label: "Cuando algo va mal", from: 17, to: 17 },
];

/** Imagen que se muestra en la cabecera del índice (infografía de los 17 casos). */
const OVERVIEW_IMAGE = "doc-huesped-infografia-casos.svg";

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Marcado en línea: se aplica DESPUÉS de escapar, así que no puede inyectar etiquetas. */
const inline = (text) =>
  escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

const anchorFrom = (heading) =>
  heading
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "seccion";

const IMAGE_REF = /^!\[([^\]]*)\]\(imagenes\/([^)]+)\)$/;
const MARKER = /^<!--\s*GENERAR_IMAGEN:.*-->$/;
const PENDING = /^<!--\s*PENDIENTE DEL CLIENTE:\s*(.*?)\s*-->$/;

/** Convierte el cuerpo de un manual (sin el H1) en secciones y en la cita inicial. */
function renderMarkdown(markdown, file) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const titleLineIndex = lines.findIndex((line) => /^#\s+\S/.test(line));
  const body = lines.filter((_, index) => index !== titleLineIndex);

  const leadParts = [];
  const sections = [];
  let current = null; // sección en curso
  let paragraph = [];
  let list = null; // { ordered: boolean, items: string[] }
  let inMermaid = false;
  let leadDone = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const html = `<p>${inline(paragraph.join(" "))}</p>`;
    (current ? current.blocks : leadParts).push(html);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    const html = `<${tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    (current ? current.blocks : leadParts).push(html);
    list = null;
  };

  const pushSection = () => {
    flushParagraph();
    flushList();
    if (current) sections.push(current);
    current = null;
  };

  for (const raw of body) {
    const line = raw.trimEnd();

    if (inMermaid) {
      if (/^```\s*$/.test(line)) inMermaid = false;
      continue; // el diagrama lo representa la imagen
    }
    if (/^```/.test(line)) {
      inMermaid = /^```mermaid/.test(line);
      continue;
    }
    if (MARKER.test(line)) continue;

    const pending = PENDING.exec(line);
    if (pending) {
      flushParagraph();
      flushList();
      const html = `<p class="pending">Pendiente de confirmar con el hotel: ${inline(pending[1])}</p>`;
      (current ? current.blocks : leadParts).push(html);
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      pushSection();
      leadDone = true;
      current = {
        id: anchorFrom(heading[2].trim()),
        title: heading[2].trim(),
        level: heading[1].length,
        blocks: [],
      };
      continue;
    }

    const image = IMAGE_REF.exec(line);
    if (image) {
      flushParagraph();
      flushList();
      const name = image[2];
      if (!existsSync(join(IMAGES_DIR, name))) {
        throw new Error(`${file}: la imagen ${name} no existe en docs/imagenes/`);
      }
      const caption = image[1] || name;
      const html =
        `<figure><img src="/manual/imagenes/${name}" alt="${escapeHtml(caption)}" ` +
        `loading="lazy" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
      (current ? current.blocks : leadParts).push(html);
      continue;
    }

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Cita inicial: solo mientras no haya empezado ninguna sección.
    if (/^>\s?/.test(line) && !leadDone && !current) {
      flushParagraph();
      flushList();
      const quote = line.replace(/^>\s?/, "");
      const last = leadParts[leadParts.length - 1];
      if (typeof last === "string" && last.startsWith("<blockquote>")) {
        leadParts[leadParts.length - 1] = `${last.slice(0, -"</blockquote>".length)} ${inline(quote)}</blockquote>`;
      } else {
        leadParts.push(`<blockquote><p>${inline(quote)}</p></blockquote>`);
      }
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  pushSection();
  if (sections.length === 0) throw new Error(`${file}: no se encontró ninguna sección ##`);

  const lead = leadParts.join("");
  return {
    lead: lead.startsWith("<blockquote>") ? lead : `<blockquote><p>${inline("Manual del huésped.")}</p></blockquote>${lead}`,
    sections,
  };
}

/** Lee los 17 manuales de caso, en orden numérico. */
function readManuals() {
  if (!existsSync(SOURCE_DIR)) throw new Error(`falta la carpeta ${SOURCE_DIR}`);
  const files = readdirSync(SOURCE_DIR)
    .filter((name) => /^\d{2}-.+\.md$/.test(name))
    .sort();

  return files.map((name) => {
    const order = Number(name.slice(0, 2));
    const moment = MOMENTS.find((entry) => order >= entry.from && order <= entry.to);
    if (!moment) throw new Error(`${name}: no pertenece a ningún momento declarado en MOMENTS`);

    const markdown = readFileSync(join(SOURCE_DIR, name), "utf8");
    const title = /\n?#\s+(.+)/.exec(markdown)?.[1]?.trim();
    if (!title) throw new Error(`${name}: no se encontró el título H1`);

    const { lead, sections } = renderMarkdown(markdown, name);
    const image = /!\[[^\]]*\]\(imagenes\/([^)]+)\)/.exec(markdown)?.[1] ?? null;

    return {
      slug: name.replace(/\.md$/, ""),
      order,
      moment: moment.id,
      title,
      lead,
      image,
      source: `docs/Manuales/06-huesped/${name}`,
      sections,
    };
  });
}

function buildModule(manuals, generatedAt) {
  const out = [];
  out.push("/**");
  out.push(" * GENERADO por `apps/web/scripts/build-huesped-manuals.mjs` — NO EDITAR A MANO.");
  out.push(" *");
  out.push(" * Regenerar con: `corepack pnpm --filter @hotel/web run huesped`.");
  out.push(` * Última generación: ${generatedAt}`);
  out.push(" *");
  out.push(` * Fuentes: ${manuals.length} manuales de caso de docs/Manuales/06-huesped/ (texto escapado).`);
  out.push(" */");
  out.push("");
  out.push("export interface HuespedSection {");
  out.push("  readonly id: string;");
  out.push("  readonly title: string;");
  out.push("  readonly level: 2 | 3;");
  out.push("  readonly html: string;");
  out.push("}");
  out.push("");
  out.push("/** Momento del viaje al que pertenece un caso (unión cerrada: la vigila el generador). */");
  out.push(
    `export type HuespedMomentId = ${MOMENTS.map((moment) => JSON.stringify(moment.id)).join(" | ")};`,
  );
  out.push("");
  out.push("export interface HuespedManual {");
  out.push("  readonly slug: string;");
  out.push("  readonly order: number;");
  out.push("  readonly moment: HuespedMomentId;");
  out.push("  readonly title: string;");
  out.push("  readonly lead: string;");
  out.push("  readonly image: string | null;");
  out.push("  readonly source: string;");
  out.push("  readonly sections: readonly HuespedSection[];");
  out.push("}");
  out.push("");
  out.push("/** Agrupación del índice por momento del viaje (rótulos en español, como los manuales). */");
  out.push(
    "export const HUESPED_MOMENTS: readonly { readonly id: HuespedMomentId; readonly label: string }[] = [",
  );
  for (const moment of MOMENTS) {
    out.push(`  { id: ${JSON.stringify(moment.id)}, label: ${JSON.stringify(moment.label)} },`);
  }
  out.push("];");
  out.push("");
  out.push(`/** Imagen de cabecera del índice. */`);
  out.push(`export const HUESPED_OVERVIEW_IMAGE = ${JSON.stringify(OVERVIEW_IMAGE)};`);
  out.push("");
  out.push("/** Versión imprimible completa (portada + los 17 capítulos). */");
  out.push('export const HUESPED_PRINTABLE = "/manual/manual-huesped.html";');
  out.push("");
  out.push("export const HUESPED_MANUALS: readonly HuespedManual[] = [");
  for (const manual of manuals) {
    out.push("  {");
    out.push(`    slug: ${JSON.stringify(manual.slug)},`);
    out.push(`    order: ${manual.order},`);
    out.push(`    moment: ${JSON.stringify(manual.moment)},`);
    out.push(`    title: ${JSON.stringify(manual.title)},`);
    out.push(`    lead: ${JSON.stringify(manual.lead)},`);
    out.push(`    image: ${JSON.stringify(manual.image)},`);
    out.push(`    source: ${JSON.stringify(manual.source)},`);
    out.push("    sections: [");
    for (const section of manual.sections) {
      out.push("      {");
      out.push(`        id: ${JSON.stringify(section.id)},`);
      out.push(`        title: ${JSON.stringify(section.title)},`);
      out.push(`        level: ${section.level},`);
      out.push(`        html: ${JSON.stringify(section.blocks.join(""))},`);
      out.push("      },");
    }
    out.push("    ],");
    out.push("  },");
  }
  out.push("];");
  out.push("");
  return out.join("\n");
}

/** Copia a `public/manual/` las ilustraciones del huésped y la versión imprimible. */
function publishAssets(manuals) {
  mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });

  const images = new Set();
  for (const manual of manuals) if (manual.image) images.add(manual.image);
  images.add(OVERVIEW_IMAGE);

  for (const name of images) {
    const from = join(IMAGES_DIR, name);
    if (!existsSync(from)) throw new Error(`falta la ilustración ${name} en docs/imagenes/`);
    copyFileSync(from, join(PUBLIC_IMAGES_DIR, name));
  }

  if (existsSync(PRINTABLE_HTML)) {
    mkdirSync(PUBLIC_MANUAL_DIR, { recursive: true });
    copyFileSync(PRINTABLE_HTML, join(PUBLIC_MANUAL_DIR, "manual-huesped.html"));
  } else {
    console.warn("  ⚠ no hay versión imprimible en docs/pdf/huesped/ (ejecuta el rol PDF del equipo)");
  }

  return images.size;
}

function main() {
  const manuals = readManuals();
  const images = publishAssets(manuals);
  mkdirSync(dirname(GENERATED_TS), { recursive: true });
  writeFileSync(GENERATED_TS, buildModule(manuals, new Date().toISOString().slice(0, 10)));

  const sections = manuals.reduce((total, manual) => total + manual.sections.length, 0);
  console.log(
    `✅ Manual del huésped: ${manuals.length} casos · ${sections} secciones · ` +
      `${images} ilustraciones publicadas en public/manual/imagenes/`,
  );
}

try {
  main();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
