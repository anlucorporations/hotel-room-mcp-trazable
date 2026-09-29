/* eslint-disable no-console */
/**
 * build-manuals.mjs — tubería de manuales (literales → web + HTML imprimible + PDF).
 *
 * Entradas (markdown en español, raíz del monorepo):
 *   docs/manual-cliente.md · docs/manual-comprador.md · docs/manual-recepcion.md
 *   docs/Manuales/05-casos-de-uso/<bloque>/CU-*.md   (32 casos de uso, orden de iniciación)
 *
 * Salidas (todas idempotentes, se reescriben en cada ejecución):
 *   1. apps/web/src/lib/help/manuals.generated.ts   módulo TypeScript que consume la sección Ayuda.
 *   2. docs/pdf/manual-<slug>.html                  documento imprimible autocontenido (A4).
 *   3. docs/pdf/manual-<slug>.pdf                   PDF A4 generado con Playwright Chromium.
 *   4. apps/web/public/manual/manual-<slug>.pdf     copia pública para la descarga de la web.
 *   5. apps/web/public/manual/imagenes/*.{svg,png}  copia de docs/imagenes/ si existe.
 *
 * Si Chromium no puede arrancar (faltan `libnspr4`/`libnss3`), usa `--no-pdf`: se regeneran el
 * módulo, el HTML imprimible y las imágenes, y se conservan los PDF ya publicados.
 *
 * El conversor de markdown es propio (SIN dependencias nuevas) y soporta exactamente el subconjunto
 * que usan los manuales: `#`/`##`/`###`, párrafos, regla horizontal `---`, citas `>`
 * multilínea, listas ordenadas/no ordenadas (con continuación indentada y anidamiento),
 * tablas con fila separadora, y en línea: negrita, cursiva, `código`, enlaces e imágenes.
 * TODO el texto de entrada se escapa siempre (nunca se inyecta markdown crudo).
 *
 * Uso:
 *   pnpm --filter @hotel/web run manuals
 *   node apps/web/scripts/build-manuals.mjs
 *   node apps/web/scripts/build-manuals.mjs --no-pdf   # sin Chromium (ver abajo)
 *
 * `--no-pdf` (o `MANUALS_SKIP_PDF=1`) omite el paso de PDF y la copia del PDF público, pero **sí**
 * regenera el módulo TypeScript, el HTML imprimible y las copias de las imágenes. Existe porque hay
 * entornos sin las librerías de Chromium (`libnspr4`/`libnss3`): antes, el fallo del PDF abortaba la
 * tubería y dejaba la web con las imágenes antiguas aunque el módulo ya apuntara a las nuevas.
 *
 * Sale con código ≠ 0 si falta un manual o si queda algún marcador interno sin resolver.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

// --- Rutas ---------------------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/scripts
const WEB_ROOT = resolve(HERE, ".."); // apps/web
const PROJECT_ROOT = resolve(WEB_ROOT, "..", ".."); // raíz del monorepo

const DOCS_DIR = join(PROJECT_ROOT, "docs");
const IMAGES_SRC = join(DOCS_DIR, "imagenes");
const PDF_DIR = join(DOCS_DIR, "pdf");
const PUBLIC_MANUAL_DIR = join(WEB_ROOT, "public", "manual");
const PUBLIC_IMAGES_DIR = join(PUBLIC_MANUAL_DIR, "imagenes");
const GENERATED_TS = join(WEB_ROOT, "src", "lib", "help", "manuals.generated.ts");

/** Un manual fuente: slug estable (contrato del consumidor) + fichero markdown. */
const SOURCES = [
  { slug: "cliente", file: "manual-cliente.md", group: "general", block: null },
  { slug: "comprador", file: "manual-comprador.md", group: "general", block: null },
  { slug: "recepcion", file: "manual-recepcion.md", group: "general", block: null },
];

/**
 * Manuales por caso de uso (`docs/Manuales/05-casos-de-uso/<bloque>/CU-*.md`).
 *
 * `CU_ORDER` fija el **orden de iniciación del sistema** (el del brief del equipo,
 * `RepoTecnico/Manuales/05-casos-de-uso/00-BRIEF-equipo-manuales.md`), que NO es el alfabético:
 * el bloque 1 empieza por CU-16 (roles) y no por CU-01, y el bloque 6 caduca antes de pausar.
 * Se descubren por glob para no repetir 32 rutas a mano; si aparece un CU sin orden declarado,
 * el generador falla en vez de colarlo al final en silencio.
 */
const CU_ROOT = join(DOCS_DIR, "Manuales", "05-casos-de-uso");
const CU_GROUP = "casos-de-uso";
const CU_ORDER = [
  "cu-16-roles",
  "cu-01-acceso-back-office",
  "cu-12-royalty",
  "cu-02-mintear-noche",
  "cu-17-onboarding-web3",
  "cu-04-catalogo",
  "cu-09-historico",
  "cu-08-asistente-ia",
  "cu-05-compra-primaria",
  "cu-06-listar-reventa",
  "cu-07-compra-secundaria",
  "cu-10-aviso-email",
  "cu-11-dashboard",
  "cu-13-caducadas",
  "cu-15-retirar-fondos",
  "cu-14-pausa",
  "cu-pr-01-faucet",
  "cu-30-acceso-owner",
  "cu-31-panel-dia-recepcion",
  "cu-32-buscar-reserva",
  "cu-33-checkin-qr",
  "cu-34-checkout",
  "cu-35-cargos-adicionales",
  "cu-36-reventa-huesped",
  "cu-37-avisos-reventa",
  "cu-40-menu-wallet",
  "cu-41-seccion-sistemas",
  "cu-42-gestion-usuarios",
  "cu-43-gobernar-contrato",
  "cu-44-finanzas-retirar",
  "cu-45-operaciones",
  "cu-46-seguridad-operador",
];
const CU_BLOCK_LABELS = {
  "01-iniciacion": "Bloque 1 · Iniciación y aprovisionamiento",
  "02-inventario": "Bloque 2 · Inventario",
  "03-onboarding-y-descubrimiento": "Bloque 3 · Onboarding y descubrimiento",
  "04-ventas": "Bloque 4 · Ventas",
  "05-postventa": "Bloque 5 · Postventa y observabilidad",
  "06-operacion-y-ciclo-de-vida": "Bloque 6 · Operación y ciclo de vida",
  "07-entorno-de-pruebas": "Bloque 7 · Entorno de pruebas",
  "08-operacion-hotelera-v2": "Bloque 8 · Operación hotelera (v2)",
  "09-back-office-y-gobierno-v3": "Bloque 9 · Back-office y gobierno (v3)",
};

/** Descubre los manuales de caso de uso y los devuelve en el orden de iniciación. */
function listCuSources() {
  if (!existsSync(CU_ROOT)) return [];
  const found = new Map();
  for (const entry of readdirSync(CU_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(CU_ROOT, entry.name);
    for (const name of readdirSync(dir)) {
      if (!/^CU-.+\.md$/.test(name)) continue;
      const slug = name
        .replace(/\.md$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      found.set(slug, {
        slug,
        file: `Manuales/05-casos-de-uso/${entry.name}/${name}`,
        group: CU_GROUP,
        block: CU_BLOCK_LABELS[entry.name] ?? entry.name,
      });
    }
  }
  const unknown = [...found.keys()].filter((slug) => !CU_ORDER.includes(slug));
  if (unknown.length > 0) {
    throw new Error(`casos de uso sin orden declarado en CU_ORDER: ${unknown.join(", ")}`);
  }
  const ordered = CU_ORDER.map((slug) => found.get(slug)).filter(Boolean);
  const missing = CU_ORDER.filter((slug) => !found.has(slug));
  if (missing.length > 0) {
    throw new Error(`faltan manuales de caso de uso: ${missing.join(", ")}`);
  }
  return ordered;
}

/** Todos los manuales: primero los generales y después los 32 casos de uso en orden de iniciación. */
const ALL_SOURCES = [...SOURCES, ...listCuSources()];

const SUBTITLE = "Hotel Marina del Sol · plataforma de noches tokenizadas";
const IMAGE_EXTENSIONS = [".svg", ".png"];

// --- Utilidades ----------------------------------------------------------------------------------

/** Escapa un texto para insertarlo con seguridad en un documento HTML. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Fecha legible en español (p. ej. «23 de febrero de 2026»), independiente del locale del sistema. */
function fechaLarga(date = new Date()) {
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Genera el identificador de ancla a partir del texto del encabezado.
 * El prefijo numérico se conserva compacto (`3. Comprar paso a paso` → `3-comprar-paso-a-paso`).
 */
function anchorFromHeading(headingText) {
  const prefixed = /^(\d{1,2})\s*[.)]\s+(.*)$/.exec(headingText.trim());
  const prefix = prefixed ? `${prefixed[1]}-` : "";
  const rest = prefixed ? prefixed[2] : headingText;
  const slug = rest
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes/diéresis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${prefix}${slug}` || "seccion";
}

/** `docs/manual-cliente.md` → `manual-cliente.md` (rutas relativas con `/` también en Windows). */
function rel(file) {
  return relative(PROJECT_ROOT, file).split(sep).join("/");
}

// --- Conversor de markdown -----------------------------------------------------------------------

/**
 * Convierte el markdown en línea a HTML, escapando SIEMPRE el texto de entrada.
 * Precedencia: `código` → imagen → enlace → negrita (`**`) → cursiva (`*`).
 * `imageOf(ref)` devuelve el `src` final para una referencia de imagen, o `null` si no se resuelve.
 */
function inlineToHtml(text, imageOf) {
  const out = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      out.push(escapeHtml(buffer));
      buffer = "";
    }
  };

  for (let i = 0; i < text.length; i += 1) {
    // Código en línea: se escapa su contenido, nunca se interpreta markdown dentro.
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push(`<code>${escapeHtml(text.slice(i + 1, end))}</code>`);
        i = end;
        continue;
      }
    }

    // Imagen: ![alt](ruta)
    if (text.startsWith("![", i)) {
      const match = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (match) {
        const src = imageOf(match[2]);
        if (src) {
          flush();
          const alt = match[1];
          out.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`);
          i += match[0].length - 1;
          continue;
        }
      }
    }

    // Enlace: [texto](url). Solo se aceptan destinos relativos, anclas o http(s) —nunca `javascript:`.
    if (text[i] === "[") {
      const match = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (match) {
        const [, label, href] = match;
        if (/^(https?:\/\/|mailto:|#|\/|\.{0,2}\/)/.test(href)) {
          flush();
          out.push(`<a href="${escapeHtml(href)}">${inlineToHtml(label, imageOf)}</a>`);
          i += match[0].length - 1;
          continue;
        }
      }
    }

    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push(`<strong>${inlineToHtml(text.slice(i + 2, end), imageOf)}</strong>`);
        i = end + 1;
        continue;
      }
    }

    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        flush();
        out.push(`<em>${inlineToHtml(text.slice(i + 1, end), imageOf)}</em>`);
        i = end;
        continue;
      }
    }

    buffer += text[i];
  }

  flush();
  return out.join("");
}

/** Divide el cuerpo de una sección en bloques (párrafo, lista, tabla, cita, regla). */
function toBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]) || lines[i].trim() !== "")) {
        if (/^\s*>/.test(lines[i])) quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "blockquote", lines: quoted });
      continue;
    }

    // Tabla: al menos dos líneas `| … |` seguidas con fila separadora `|---|`.
    if (line.trim().startsWith("|")) {
      let j = i;
      const tableLines = [];
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        tableLines.push(lines[j].trim());
        j += 1;
      }
      if (tableLines.length >= 2 && /^\|[\s:|-]+\|$/.test(tableLines[1])) {
        blocks.push({ kind: "table", lines: tableLines });
        i = j;
        continue;
      }
    }

    const UNORDERED = /^(\s*)[-*]\s+(.*)$/;
    const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
    if (UNORDERED.test(line) || ORDERED.test(line)) {
      const items = [];
      while (i < lines.length) {
        // Listas ordenadas y no ordenadas se reconocen al mismo tiempo: un punto de una lista
        // ordenada puede llevar una sublista con guiones (y al revés), y eso NO debe partir la
        // lista en dos bloques: la sublista va dentro del `<li>` del punto padre.
        const orderedMatch = ORDERED.exec(lines[i]);
        const unorderedMatch = orderedMatch ?? UNORDERED.exec(lines[i]);
        if (unorderedMatch) {
          items.push({
            kind: orderedMatch ? "ol" : "ul",
            indent: (unorderedMatch[1] ?? "").replace(/\t/g, "    ").length,
            text: (unorderedMatch[2] ?? "").trim(),
          });
          i += 1;
          continue;
        }
        // Línea de continuación: pertenece al último punto si está indentada o no abre bloque nuevo.
        const raw = lines[i];
        if (
          raw.trim() !== "" &&
          items.length > 0 &&
          !/^(\s*)([-*]|\d+[.)])\s+/.test(raw) &&
          !/^\s*[|>]/.test(raw) &&
          !/^\s*---+\s*$/.test(raw) &&
          !/^#{1,6}\s/.test(raw)
        ) {
          const last = items[items.length - 1];
          if (last) last.text += ` ${raw.trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      // La lista se abre con el marcador del PRIMER punto (la indentación crea los niveles).
      blocks.push({ kind: items[0]?.kind ?? "ul", items });
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^(\s*)([-*]|\d+[.)])\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

/** Celdas de una fila de tabla: `| a | b |` → `["a", "b"]`. */
function tableCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/**
 * Renderiza una lista anidando las sublistas DENTRO del `<li>` del punto padre, como exige el HTML
 * válido (y las reglas `list`/`listitem` de axe: un `<ul>`/`<ol>` no puede ser hijo directo de otro
 * `<ul>`/`<ol>`, y todo `<li>` tiene que estar contenido en una lista).
 *
 * La indentación define el nivel (0 → raíz; 1–3 espacios → un nivel; ≥4 → dos niveles) y cada punto
 * puede ser ordenado o no ordenado, incluso mezclados en el mismo nivel.
 *
 * Se construye primero un ÁRBOL de puntos (pila de ancestros por profundidad) y se renderiza
 * después de forma recursiva: así el `<li>` padre envuelve su sublista sin emitir etiquetas en un
 * orden que el parser HTML pueda reordenar o descartar.
 */
function renderList(block, imageOf) {
  /** Nivel de indentación de un punto: 0 → raíz; 1–3 espacios → un nivel; ≥4 → dos niveles. */
  const depthOf = (item) => (item.indent === 0 ? 0 : item.indent >= 4 ? 2 : 1);

  /** Construye la secuencia de puntos `[start, end)` al nivel pedido, con sus sublistas colgando. */
  const build = (start, end, level) => {
    const items = [];
    let i = start;
    while (i < end) {
      const current = block.items[i];
      if (!current || depthOf(current) !== level) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < end && depthOf(block.items[j] ?? { indent: 0 }) > level) j += 1;
      items.push({
        kind: current.kind,
        text: current.text,
        children: level < 2 ? build(i + 1, j, level + 1) : [],
      });
      i = j;
    }
    return items;
  };

  const renderItems = (items) => {
    const out = [];
    let index = 0;
    while (index < items.length) {
      // Los puntos consecutivos con el mismo marcador van en la misma lista; al cambiar, otra.
      const kind = items[index]?.kind ?? "ul";
      out.push(`<${kind}>`);
      while (index < items.length && items[index]?.kind === kind) {
        const item = items[index];
        if (item) {
          out.push(`<li>${inlineToHtml(item.text, imageOf)}${renderItems(item.children)}</li>`);
        }
        index += 1;
      }
      out.push(`</${kind}>`);
    }
    return out.join("");
  };

  return renderItems(build(0, block.items.length, 0));
}

/** En línea: solo una imagen (los manuales las ponen en su propio párrafo). */
const STANDALONE_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/** Convierte la lista de bloques a HTML. `imageOf` resuelve las rutas de imagen del destino. */
function blocksToHtml(blocks, imageOf) {
  const out = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "rule":
        out.push("<hr />");
        break;
      case "paragraph": {
        const standalone = STANDALONE_IMAGE.exec(block.text.trim());
        if (standalone) {
          const src = imageOf(standalone[2]);
          if (src) {
            // Las imágenes de los manuales son ilustraciones anchas: van en <figure> con su pie,
            // y el CSS les fija `max-width: 100%` (si no, desbordan la caja A4).
            out.push(
              `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(standalone[1])}" />` +
                `<figcaption>${escapeHtml(standalone[1])}</figcaption></figure>`,
            );
            break;
          }
        }
        out.push(`<p>${inlineToHtml(block.text, imageOf)}</p>`);
        break;
      }
      case "blockquote":
        out.push(`<blockquote><p>${inlineToHtml(block.lines.join(" ").trim(), imageOf)}</p></blockquote>`);
        break;
      case "ul":
      case "ol":
        out.push(renderList(block, imageOf));
        break;
      case "table": {
        const [header, , ...rows] = block.lines;
        const head = tableCells(header);
        const body = rows.map(tableCells);
        out.push("<table>");
        out.push(
          `<thead><tr>${head.map((cell) => `<th>${inlineToHtml(cell, imageOf)}</th>`).join("")}</tr></thead>`,
        );
        out.push("<tbody>");
        for (const row of body) {
          out.push(`<tr>${row.map((cell) => `<td>${inlineToHtml(cell, imageOf)}</td>`).join("")}</tr>`);
        }
        out.push("</tbody></table>");
        break;
      }
      default:
        throw new Error(`bloque de markdown desconocido: ${block.kind}`);
    }
  }

  return out.join("\n");
}

/**
 * Convierte el cuerpo (la sección, SIN su encabezado) de una sección: recorta las líneas de
 * encabezado y las vacías de los extremos y devuelve el HTML.
 */
function sectionBodyToBlocks(lines) {
  const body = lines.filter((line) => !/^#{1,6}\s/.test(line));
  while (body.length > 0 && body[0].trim() === "") body.shift();
  while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
  return toBlocks(body);
}

// --- Imágenes ------------------------------------------------------------------------------------

/**
 * Manifiesto de imágenes: referencia del markdown → token interno. Los tokens se sustituyen al
 * final por la ruta del destino (`/manual/imagenes/…` para la web, `../imagenes/…` para docs/pdf).
 * Si algún token sobrevive, el script falla (marcador sin resolver).
 */
function createImageResolver() {
  const tokens = new Map();

  const tokenFor = (rawRef) => {
    const base = rawRef.split(/[\\/]/).pop();
    if (!IMAGE_EXTENSIONS.includes(base.slice(base.lastIndexOf(".")).toLowerCase())) return null;
    if (!tokens.has(base)) tokens.set(base, `\u0000IMG${tokens.size}\u0000`);
    return tokens.get(base);
  };

  const applyTo = (html, template) => {
    let result = html;
    for (const [base, token] of tokens) {
      result = result.split(token).join(template(base));
    }
    if (result.includes("\u0000")) {
      throw new Error("quedaron marcadores internos sin resolver al aplicar las rutas de imagen");
    }
    return result;
  };

  return { tokens, tokenFor, applyTo };
}

/** Lista recursiva de imágenes disponibles en `docs/imagenes/`. */
function listAvailableImages(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listAvailableImages(full));
      continue;
    }
    if (IMAGE_EXTENSIONS.includes(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

// --- Análisis del manual -------------------------------------------------------------------------

/**
 * Analiza un manual completo y devuelve su estructura.
 * `imageOf` resuelve las imágenes con la ruta de destino que se le pase.
 *
 * `lead` es TODO el preámbulo: la cita inicial (`>`) **y** el resto de bloques que van entre el H1
 * y la primera sección `##` (en los manuales actuales, la ilustración de portada). Descartar esos
 * bloques hacía que la imagen `imagenes/doc-portada-hotel.svg` se perdiera en el módulo y en el PDF.
 */
function parseManual(markdown, { slug, imageOf, file }) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  const titleLine = lines.find((line) => /^#\s+\S/.test(line));
  if (!titleLine) throw new Error(`${file}: no se encontró el título H1`);
  const title = titleLine.replace(/^#\s+/, "").trim();

  const body = lines.filter((line) => line !== titleLine);

  // Preámbulo: desde después del H1 hasta la primera sección `##`/`###` (exclusive).
  let preambleEnd = body.length;
  for (let i = 0; i < body.length; i += 1) {
    if (/^#{2,3}\s+\S/.test(body[i])) {
      preambleEnd = i;
      break;
    }
  }
  const lead = blocksToHtml(sectionBodyToBlocks(body.slice(0, preambleEnd)), imageOf)
    // El `---` que separa el preámbulo de la primera sección no aporta nada en la portada.
    .replace(/(\s*<hr \/>)+$/, "");

  // Secciones: cada `##`/`###` abre una sección con su cuerpo (sin el encabezado).
  const headings = [];
  const sections = [];
  const usedIds = new Map();

  for (let i = 0; i < body.length; i += 1) {
    const match = /^(#{2,3})\s+(.*)$/.exec(body[i]);
    if (!match) continue;

    const level = match[1].length;
    const heading = match[2].trim();
    let id = anchorFromHeading(heading);
    if (usedIds.has(id)) {
      usedIds.set(id, usedIds.get(id) + 1);
      id = `${id}-${usedIds.get(id)}`;
    } else {
      usedIds.set(id, 1);
    }

    headings.push({ level, heading, id });

    let end = body.length;
    for (let j = i + 1; j < body.length; j += 1) {
      if (/^#{1,6}\s/.test(body[j])) {
        end = j;
        break;
      }
    }

    sections.push({
      id,
      title: heading,
      level,
      html: blocksToHtml(sectionBodyToBlocks(body.slice(i + 1, end)), imageOf),
    });
    i = end - 1;
  }

  if (sections.length === 0) throw new Error(`${file}: no se encontró ninguna sección ##`);

  return {
    slug,
    title,
    lead,
    pdf: `/manual/manual-${slug}.pdf`,
    sections,
    headings,
    file,
  };
}

// --- Documento imprimible (HTML A4) --------------------------------------------------------------

/** CSS del documento imprimible: paleta y tipografías reales del proyecto. */
const PRINT_CSS = `
  :root {
    --sand: #fbf6ec;
    --sand-2: #f3ead8;
    --shell: #ffffff;
    --line: #e7dcc6;
    --ink: #1b2327;
    --ink-soft: #4c575c;
    --sea: #0e5a63;
    --sea-deep: #08424a;
    --terracotta: #c0542e;
    --olive: #5e6b45;
    --gold: #c68a2e;
  }
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    background: var(--sand);
    color: var(--ink);
    font-family: "Hanken Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif;
    font-size: 11.5pt;
    line-height: 1.55;
  }
  h1, h2, h3 { font-family: "Fraunces", Georgia, "Times New Roman", serif; color: var(--ink); }
  a { color: var(--sea-deep); text-decoration: underline; text-decoration-thickness: 0.5px; }

  .cover {
    page-break-after: always;
    break-after: page;
    /* Ocupa exactamente la caja útil de una A4 (297 mm − 18 mm de margen superior) para que la
       portada no se mezcle con el índice y no desborde a una segunda página. */
    height: 277mm;
    padding: 16mm 18mm 12mm;
    background: var(--sand);
    border-bottom: 6mm solid var(--sea);
  }
  .cover .eyebrow {
    font-size: 9.5pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--terracotta);
    margin: 0 0 8mm;
  }
  .cover h1 { font-size: 28pt; line-height: 1.08; margin: 0 0 5mm; letter-spacing: -0.01em; }
  .cover .rule { width: 32mm; height: 3px; background: var(--gold); margin: 0 0 6mm; }
  .cover .subtitle { font-size: 12pt; color: var(--sea-deep); margin: 0 0 3mm; font-weight: 600; }
  .cover .date { font-size: 10.5pt; color: var(--ink-soft); margin: 0; }
  .cover .lead {
    margin-top: 10mm;
    padding: 5mm 6mm;
    background: var(--shell);
    border-left: 3px solid var(--sea);
    border-radius: 3px;
    color: var(--ink-soft);
    font-size: 10.5pt;
  }
  .cover .lead p { margin: 0 0 3mm; }
  .cover .lead p:last-child { margin-bottom: 0; }
  /* La ilustración de portada (segundo bloque del preámbulo) va tras la cita. */
  .cover .lead blockquote { margin-bottom: 4mm; }
  .cover .lead figure { margin: 0; }
  .cover .lead figcaption { font-style: italic; }

  .toc { page-break-after: always; break-after: page; padding: 18mm; }
  .toc h2 { font-size: 20pt; margin: 0 0 8mm; border-bottom: 2px solid var(--line); padding-bottom: 3mm; }
  .toc ol { list-style: none; margin: 0; padding: 0; }
  .toc li { margin: 0 0 2.4mm; }
  .toc li.level-3 { margin-left: 8mm; font-size: 10.5pt; color: var(--ink-soft); }
  .toc a { text-decoration: none; }
  .toc .num { color: var(--terracotta); font-weight: 700; margin-right: 2mm; }

  .content { padding: 0 18mm 18mm; }
  .manual-section { break-inside: auto; }
  .manual-section.level-2 { page-break-before: auto; }
  h2.section {
    font-size: 17pt;
    margin: 12mm 0 4mm;
    padding-top: 3mm;
    border-top: 2px solid var(--line);
    color: var(--sea-deep);
    break-after: avoid;
    page-break-after: avoid;
  }
  h2.section:first-of-type { margin-top: 0; }
  h3.section {
    font-size: 13pt;
    margin: 8mm 0 3mm;
    color: var(--terracotta);
    break-after: avoid;
    page-break-after: avoid;
  }
  p { margin: 0 0 3.4mm; }
  strong { color: var(--ink); }
  code {
    font-family: "DejaVu Sans Mono", "Consolas", monospace;
    font-size: 0.92em;
    background: var(--sand-2);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 0 0.3em;
    white-space: nowrap;
  }
  blockquote {
    margin: 0 0 4mm;
    padding: 3mm 5mm;
    background: var(--shell);
    border-left: 3px solid var(--gold);
    color: var(--ink-soft);
  }
  blockquote p { margin: 0; }
  ul, ol { margin: 0 0 4mm; padding-left: 7mm; }
  li { margin: 0 0 1.6mm; }
  ul ul, ol ol, ul ol, ol ul { margin: 1.6mm 0 0; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 7mm 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 5mm;
    font-size: 10pt;
    background: var(--shell);
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th {
    background: var(--sea-deep);
    color: #ffffff;
    text-align: left;
    font-weight: 600;
    padding: 2.4mm 3mm;
    border: 1px solid var(--sea-deep);
  }
  td {
    padding: 2.4mm 3mm;
    border: 1px solid var(--line);
    vertical-align: top;
  }
  tbody tr:nth-child(even) td { background: var(--sand); }
  figure { margin: 0 0 5mm; break-inside: avoid; page-break-inside: avoid; }
  p > img { max-width: 100%; height: auto; }
  figure img {
    display: block;
    max-width: 100%;
    max-height: 150mm;
    height: auto;
    margin: 0 auto;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--shell);
  }
  figcaption {
    font-size: 9pt;
    color: var(--ink-soft);
    text-align: center;
    margin-top: 2mm;
    font-style: italic;
  }
`;

/** Pie de página del PDF: título del manual + «Página X de Y». */
function footerTemplate(title) {
  return `<div style="width:100%;font-family:'Hanken Grotesk','Segoe UI',sans-serif;font-size:8pt;color:#4c575c;padding:0 14mm;display:flex;justify-content:space-between;">
    <span>${escapeHtml(title)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

/** Cabecera del PDF: nombre de la plataforma. */
function headerTemplate() {
  return `<div style="width:100%;font-family:'Hanken Grotesk','Segoe UI',sans-serif;font-size:8pt;color:#4c575c;padding:0 14mm;">
    <span>Hotel Marina del Sol · manuales</span>
  </div>`;
}

/** Construye el documento HTML imprimible completo (autocontenido). */
function buildPrintableHtml(doc, generatedAt) {
  const toc = doc.sections
    .map(
      (section) =>
        `<li class="level-${section.level}"><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`,
    )
    .join("\n      ");

  const sections = doc.sections
    .map(
      (section) =>
        `<section class="manual-section level-${section.level}" id="${escapeHtml(section.id)}">\n` +
        `<h${section.level} class="section">${escapeHtml(section.title)}</h${section.level}>\n` +
        `${section.html}\n</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header class="cover">
    <p class="eyebrow">Manuales · Hotel Marina del Sol</p>
    <h1>${escapeHtml(doc.title)}</h1>
    <div class="rule"></div>
    <p class="subtitle">${escapeHtml(SUBTITLE)}</p>
    <p class="date">Generado el ${escapeHtml(generatedAt)}</p>
    <div class="lead">${doc.lead}</div>
  </header>

  <nav class="toc">
    <h2>Índice</h2>
    <ol>
      ${toc}
    </ol>
  </nav>

  <main class="content">
${sections}
  </main>
</body>
</html>
`;
}

// --- Módulo TypeScript generado ------------------------------------------------------------------

/** Serializa el módulo `manuals.generated.ts` con la interfaz EXACTA del contrato. */
function buildGeneratedModule(docs, generatedAt) {
  const chunks = [];
  chunks.push("/**");
  chunks.push(" * GENERADO por `apps/web/scripts/build-manuals.mjs` — NO EDITAR A MANO.");
  chunks.push(" *");
  chunks.push(" * Regenerar con: `pnpm --filter @hotel/web run manuals` (o `pnpm build:manuals`).");
  chunks.push(` * Última generación: ${generatedAt}`);
  chunks.push(" *");
  chunks.push(
    ` * Fuentes: ${docs.length} manuales — 3 generales (docs/manual-*.md) + ` +
      `${docs.length - 3} casos de uso (docs/Manuales/05-casos-de-uso/**)`,
  );
  chunks.push(" */");
  chunks.push("/* eslint-disable */");
  chunks.push("");
  chunks.push("export interface ManualSection {");
  chunks.push("  readonly id: string;");
  chunks.push("  readonly title: string;");
  chunks.push("  readonly level: 2 | 3;");
  chunks.push("  readonly html: string;");
  chunks.push("}");
  chunks.push("");
  chunks.push("export interface ManualDoc {");
  chunks.push('  readonly slug: string;      // "cliente" | "comprador" | "recepcion" | "cu-16-roles" | …');
  chunks.push("  readonly title: string;     // el H1 del manual");
  chunks.push("  readonly lead: string;      // el blockquote inicial, ya convertido a HTML");
  chunks.push('  readonly pdf: string;       // "/manual/manual-<slug>.pdf"');
  chunks.push('  readonly group: "general" | "casos-de-uso";');
  chunks.push('  readonly block: string | null; // p. ej. "Bloque 1 · Iniciación y aprovisionamiento"');
  chunks.push("  readonly sections: readonly ManualSection[];");
  chunks.push("}");
  chunks.push("");
  chunks.push("export const MANUALS: readonly ManualDoc[] = [");
  for (const doc of docs) {
    chunks.push("  {");
    chunks.push(`    slug: ${JSON.stringify(doc.slug)},`);
    chunks.push(`    title: ${JSON.stringify(doc.title)},`);
    chunks.push(`    lead: ${JSON.stringify(doc.lead)},`);
    chunks.push(`    pdf: ${JSON.stringify(doc.pdf)},`);
    chunks.push(`    group: ${JSON.stringify(doc.group)},`);
    chunks.push(`    block: ${JSON.stringify(doc.block ?? null)},`);
    chunks.push("    sections: [");
    for (const section of doc.sections) {
      chunks.push("      {");
      chunks.push(`        id: ${JSON.stringify(section.id)},`);
      chunks.push(`        title: ${JSON.stringify(section.title)},`);
      chunks.push(`        level: ${section.level},`);
      chunks.push(`        html: ${JSON.stringify(section.html)},`);
      chunks.push("      },");
    }
    chunks.push("    ],");
    chunks.push("  },");
  }
  chunks.push("];");
  chunks.push("");
  return chunks.join("\n");
}

// --- Construcción --------------------------------------------------------------------------------

/** Escribe un fichero creando su carpeta si hace falta e informando por consola. */
function writeOut(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  const size = statSync(file).size;
  console.log(`  ✎ ${rel(file)} (${(size / 1024).toFixed(1)} KB)`);
}

/** Comprueba que las imágenes referenciadas existen y que no quedan marcadores internos. */
function assertNoLeftover(html, where) {
  if (html.includes("\u0000")) {
    throw new Error(`${where}: quedaron marcadores internos sin resolver en el HTML generado`);
  }
}

async function main() {
  const startedAt = Date.now();
  const generatedAt = fechaLarga();

  console.log("Manuales → web + HTML imprimible + PDF");
  console.log(`  raíz = ${PROJECT_ROOT}\n`);

  const availableImages = listAvailableImages(IMAGES_SRC);
  const availableNames = new Set(availableImages.map((file) => file.split(sep).pop()));
  console.log(`Imágenes en ${rel(IMAGES_SRC)}: ${availableImages.length}`);

  const docs = [];
  for (const source of ALL_SOURCES) {
    const file = join(DOCS_DIR, source.file);
    if (!existsSync(file)) throw new Error(`falta el manual fuente: ${rel(file)}`);

    const markdown = readFileSync(file, "utf8");

    // Se analiza el manual dos veces con resolutores distintos: el mismo análisis produce las rutas
    // de imagen que necesita cada destino (`/manual/imagenes/…` para la web, `../imagenes/…` para
    // `docs/pdf/`).
    const webResolver = createImageResolver();
    const web = parseManual(markdown, {
      slug: source.slug,
      file: source.file,
      imageOf: (ref) => {
        const base = ref.split(/[\\/]/).pop();
        if (!availableNames.has(base)) usedMissing.add(`${source.file} → ${ref}`);
        return webResolver.tokenFor(ref);
      },
    });

    const printResolver = createImageResolver();
    const print = parseManual(markdown, {
      slug: source.slug,
      file: source.file,
      imageOf: (ref) => printResolver.tokenFor(ref),
    });

    const doc = {
      slug: web.slug,
      title: web.title,
      pdf: web.pdf,
      group: source.group,
      block: source.block ?? null,
      lead: webResolver.applyTo(web.lead, (base) => `/manual/imagenes/${base}`),
      sections: web.sections.map((section) => ({
        ...section,
        html: webResolver.applyTo(section.html, (base) => `/manual/imagenes/${base}`),
      })),
      headline: web.headings,
      printLead: printResolver.applyTo(print.lead, (base) => `../imagenes/${base}`),
      printSections: print.sections.map((section) => ({
        ...section,
        html: printResolver.applyTo(section.html, (base) => `../imagenes/${base}`),
      })),
      file: source.file,
    };

    assertNoLeftover(
      [doc.lead, ...doc.sections.map((section) => section.html)].join(""),
      `${source.file} (web)`,
    );
    assertNoLeftover(
      [doc.printLead, ...doc.printSections.map((section) => section.html)].join(""),
      `${source.file} (pdf)`,
    );

    docs.push(doc);
    console.log(
      `  ✓ ${source.file}: ${doc.sections.filter((s) => s.level === 2).length} secciones ##, ` +
        `${doc.sections.filter((s) => s.level === 3).length} subsecciones ###`,
    );
  }

  if (docs.length !== ALL_SOURCES.length) {
    throw new Error(`se esperaban ${ALL_SOURCES.length} manuales y se procesaron ${docs.length}`);
  }

  // 1) Módulo TypeScript.
  console.log("\nMódulo TypeScript:");
  writeOut(GENERATED_TS, buildGeneratedModule(docs, generatedAt));

  // 2) HTML imprimible.
  console.log("\nHTML imprimible (docs/pdf):");
  const printDocs = docs.map((doc) => ({
    ...doc,
    lead: doc.printLead,
    sections: doc.printSections,
  }));
  for (const doc of printDocs) {
    writeOut(join(PDF_DIR, `manual-${doc.slug}.html`), buildPrintableHtml(doc, generatedAt));
  }

  // 3) PDF con Playwright Chromium.
  const skipPdf = process.argv.includes("--no-pdf") || process.env.MANUALS_SKIP_PDF === "1";
  if (skipPdf) {
    console.log("\nPDF (Playwright Chromium, A4): OMITIDO (--no-pdf) — los PDF actuales no se tocan");
  } else {
  console.log("\nPDF (Playwright Chromium, A4):");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const doc of printDocs) {
      const htmlPath = join(PDF_DIR, `manual-${doc.slug}.html`);
      const pdfPath = join(PDF_DIR, `manual-${doc.slug}.pdf`);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: true,
        headerTemplate: headerTemplate(),
        footerTemplate: footerTemplate(doc.title),
        margin: { top: "18mm", right: "0mm", bottom: "18mm", left: "0mm" },
      });
      const size = statSync(pdfPath).size;
      console.log(`  ✎ ${rel(pdfPath)} (${(size / 1024).toFixed(1)} KB)`);
      if (size < 20 * 1024) {
        throw new Error(`${rel(pdfPath)} es sospechosamente pequeño (${size} bytes)`);
      }
    }
  } finally {
    await browser.close();
  }
  }

  // 4) Copias públicas para la web.
  console.log("\nCopias públicas (apps/web/public/manual):");
  mkdirSync(PUBLIC_MANUAL_DIR, { recursive: true });
  if (skipPdf) {
    console.log("  · PDF no regenerados: se conservan los publicados (ejecuta sin --no-pdf para rehacerlos)");
  }
  for (const doc of docs) {
    if (skipPdf) break;
    const from = join(PDF_DIR, `manual-${doc.slug}.pdf`);
    const to = join(PUBLIC_MANUAL_DIR, `manual-${doc.slug}.pdf`);
    cpSync(from, to);
    console.log(`  ✎ ${rel(to)}`);
  }

  if (availableImages.length > 0) {
    rmSync(PUBLIC_IMAGES_DIR, { recursive: true, force: true });
    mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
    for (const image of availableImages) {
      const to = join(PUBLIC_IMAGES_DIR, image.split(sep).pop());
      cpSync(image, to);
      console.log(`  ✎ ${rel(to)}`);
    }
  } else {
    console.log(`  · sin imágenes que copiar (${rel(IMAGES_SRC)} no contiene .svg/.png)`);
  }

  const totalSections = docs.reduce((sum, doc) => sum + doc.sections.length, 0);
  console.log(
    `\n✅ Listo: ${docs.length} manuales · ${totalSections} secciones · ` +
      `${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
}

/** Imágenes referenciadas que no existen en docs/imagenes/ (aviso, no error). */
const usedMissing = new Set();

main()
  .then(() => {
    if (usedMissing.size > 0) {
      console.warn("\n⚠️  Imágenes referenciadas que no están en docs/imagenes/:");
      for (const item of usedMissing) console.warn(`   · ${item}`);
    }
  })
  .catch((error) => {
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
