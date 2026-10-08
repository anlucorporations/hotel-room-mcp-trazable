/* eslint-disable no-console */
/**
 * build-knowledge-index.mjs — índice de conocimiento del asistente (hito H2 de la v3).
 *
 * POR QUÉ UN SCRIPT APARTE Y NO `apps/web/scripts/build-manuals.mjs`
 * -----------------------------------------------------------------
 * La tubería de manuales es ESTRICTA a propósito (produce la web y el PDF) y hoy está rota en el
 * repositorio por dos casos de uso sin imagen y con el blockquote duplicado (CU-38/CU-39), además de
 * que la generación de manuales exige declarar cada CU en `CU_ORDER`. El índice de conocimiento no
 * necesita nada de eso: solo texto y secciones. Desacoplarlo permite que H2 avance sin tocar la
 * tubería de la web y sin heredar sus fallos de contenido.
 *
 * POR QUÉ NO SE INDEXA `RepoTecnico/Manuales/**` NI LOS CASOS DE USO (decisión revisada de B1)
 * ------------------------------------------------------------------------------------------
 * 1. El guardián de secretos del repositorio (`apps/web/src/lib/secrets-guardian.test.ts`, D-04)
 *    escanea `apps/` y `packages/` y prohíbe que reaparezcan credenciales retiradas. Al materializar
 *    los manuales técnicos dentro de `apps/mcp/`, el índice arrastraba una **semilla TOTP de ejemplo**
 *    de la documentación técnica y hacía fallar el guardián. Tiene razón: una credencial de ejemplo
 *    dentro del árbol de una aplicación es exactamente lo que D-04 evita.
 * 2. El MCP se despliega con `--allow-unauthenticated` (ver `infra/gcp/70-deploy-apps.sh`). La
 *    audiencia es un parámetro que envía el LLAMANTE, así que `audience: "interno"` permitiría a
 *    cualquiera extraer runbooks, procedimientos de incidentes y ejemplos de credenciales. La escalera
 *    de audiencias protege al asistente del huésped, **no** al endpoint.
 *
 * Por eso el índice del servicio contiene únicamente los manuales dirigidos a personas (huésped,
 * recepción y propietario). Si algún día hace falta conocimiento interno, debe ser otra superficie,
 * autenticada y con redacción previa; este script lo deja preparado con `audience` por fuente.
 *
 * Uso:
 *   corepack pnpm --filter @hotel/mcp run knowledge
 *   node apps/mcp/scripts/build-knowledge-index.mjs
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/mcp/scripts
const MCP_ROOT = resolve(HERE, ".."); // apps/mcp
const PROJECT_ROOT = resolve(MCP_ROOT, "..", ".."); // raíz del monorepo
const OUTPUT = join(MCP_ROOT, "src", "knowledge", "index.generated.ts");

/**
 * Fuentes indexadas, con la audiencia que puede verlas. `cliente` = huésped que compra;
 * `recepcion` = personal del mostrador; `propietario` = dueño del hotel (el fichero se llama
 * `manual-cliente.md`, pero está escrito para Carlos, no para el huésped).
 */
const SOURCES = [
  { slug: "huesped", file: "docs/manual-huesped.md", audience: "cliente" },
  { slug: "comprador", file: "docs/manual-comprador.md", audience: "cliente" },
  { slug: "recepcion", file: "docs/manual-recepcion.md", audience: "recepcion" },
  { slug: "cliente", file: "docs/manual-cliente.md", audience: "propietario" },
];

/**
 * Manuales literales de los CASOS DEL HUÉSPED (`docs/Manuales/06-huesped/<NN>-<caso>.md`), uno por
 * caso que puede solicitar. Todos son audiencia `cliente`: están escritos para el huésped y derivan
 * del producto real, no de documentación interna.
 */
const GUEST_CASES_DIR = "docs/Manuales/06-huesped";

/** Descubre los casos del huésped por glob (el `README.md` del árbol es un índice, no un manual). */
function listGuestCases() {
  const dir = join(PROJECT_ROOT, GUEST_CASES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => ({
      slug: `huesped-${entry.name.replace(/\.md$/, "")}`,
      file: `${GUEST_CASES_DIR}/${entry.name}`,
      audience: "cliente",
    }))
    .sort((a, b) => a.file.localeCompare(b.file, "es"));
}

/** Longitud máxima de un fragmento antes de partirlo por frases (caracteres). */
/**
 * Troceado por PÁRRAFOS (H5). El buscador devuelve solo los primeros 600 caracteres de cada fragmento
 * (`MAX_EXCERPT_CHARS`), así que un fragmento de 1200 escondía la mitad de su contenido al modelo: la
 * cifra de la comisión o la frase del cobro quedaban fuera de su vista. Con fragmentos de ~500
 * caracteres, el extracto cubre el fragmento **entero**.
 */
const CHUNK_TARGET_CHARS = 500;
/** Tope duro: un párrafo mayor que esto se parte por frases. */
const CHUNK_MAX_CHARS = 800;

/**
 * Patrones que NUNCA deben acabar en el índice del servicio.
 *
 * Es una red de seguridad para el futuro (hoy las fuentes son manuales para personas y ya se
 * publican en la web). Están calibrados para detectar **credenciales reales**, no palabras: una
 * primera versión marcaba `contraseña:` en cualquier frase y saltaba con prosa legítima como
 * «no crea una cuenta con contraseña: tu cartera es tu identidad».
 */
const FORBIDDEN = [
  /BEGIN [A-Z ]*PRIVATE KEY/, // clave PEM pegada en el manual
  /0x[0-9a-fA-F]{64}\b/, // clave privada Ethereum (32 bytes)
  /\bsk-[A-Za-z0-9_-]{16,}/, // clave de API estilo OpenAI
  /\bAIza[0-9A-Za-z_-]{30,}/, // clave de API de Google
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, // JWT
  /\b[A-Z2-7]{32}\b/, // semilla TOTP en base32
  /(?:seed|semilla)\s+(?:phrase|totp|de ejemplo)/i,
  /password\s*[:=]\s*["'`]?[A-Za-z0-9!@#$%^&*_-]{8,}/i, // «password: <valor>» con valor plausible
];

/** Convierte el markdown a texto plano indexable (sin vallas, imágenes, enlaces ni énfasis). */
function textFromMarkdown(markdown) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ancla estable a partir del título de una sección (mismo criterio que la tubería de manuales). */
function anchorFromHeading(heading) {
  return heading
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Analiza el markdown de forma tolerante: H1 para el título, `##`/`###` para las secciones. */
function parseManual(markdown, file) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const titleLine = lines.find((line) => /^#\s+\S/.test(line));
  if (!titleLine) throw new Error(`${file}: no se encontró el título H1`);
  const title = titleLine.replace(/^#\s+/, "").trim();
  const body = lines.filter((line) => line !== titleLine);

  let headings = 0;
  const sections = [];
  const usedIds = new Map();
  let current = { id: "portada", title, lines: [] };

  const flush = () => {
    const text = textFromMarkdown(current.lines.join("\n"));
    if (text) sections.push({ id: current.id, title: current.title, lines: current.lines, text });
  };

  for (const line of body) {
    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!match) {
      current.lines.push(line);
      continue;
    }
    flush();
    headings += 1;
    const heading = match[2].trim();
    let id = anchorFromHeading(heading) || "seccion";
    if (usedIds.has(id)) {
      usedIds.set(id, usedIds.get(id) + 1);
      id = `${id}-${usedIds.get(id)}`;
    } else {
      usedIds.set(id, 1);
    }
    current = { id, title: heading, lines: [] };
  }
  flush();

  if (headings === 0) throw new Error(`${file}: no se encontró ninguna sección ##`);
  // Un manual puede estar aún SIN CONTENIDO (sus secciones solo llevan comentarios de plantilla):
  // no es un error, pero tampoco se indexa nada vacío.
  return { title, sections };
}

/** Bloques de un apartado: los separa una línea en blanco (un párrafo o una lista). */
function paragraphBlocks(lines) {
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Trocea un apartado en fragmentos por párrafos, empaquetando los consecutivos hasta el objetivo.
 *
 * Se conserva el `id` de la sección (con sufijo `~n`) y su título, que es lo que el asistente cita:
 * trocear más fino **no** cambia las citas, solo hace que el modelo vea el fragmento completo.
 */
function chunkSection(section) {
  const blocks = paragraphBlocks(section.lines)
    .map((block) => textFromMarkdown(block.join("\n")))
    .filter((text) => text.length > 0);

  const chunks = [];
  let current = "";
  for (const block of blocks) {
    for (const piece of splitText(block, CHUNK_MAX_CHARS)) {
      if (current && current.length + piece.length + 1 > CHUNK_TARGET_CHARS) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  // Un apartado sin líneas en blanco (o vacío tras limpiar) cae al troceado por frases.
  return chunks.length > 0 ? chunks : splitText(section.text, CHUNK_MAX_CHARS);
}

/** Parte un texto largo por frases para no diluir la recuperación en fragmentos enormes. */
function splitText(text, max = CHUNK_MAX_CHARS) {
  if (text.length <= max) return [text];
  const parts = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (current && current.length + sentence.length + 1 > max) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) parts.push(current);
  return parts;
}

/** Comprueba que ningún fragmento arrastra credenciales antes de escribirlo. */
function assertNoForbidden(chunks) {
  for (const chunk of chunks) {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(chunk.text)) {
        throw new Error(
          `el fragmento ${chunk.id} (${chunk.source}) contiene algo que no debe publicarse: ${pattern}`,
        );
      }
    }
  }
}

function buildChunks() {
  const chunks = [];
  const sources = [...SOURCES, ...listGuestCases()];
  for (const source of sources) {
    const path = join(PROJECT_ROOT, source.file);
    if (!existsSync(path)) throw new Error(`falta el manual fuente: ${source.file}`);
    const { title, sections } = parseManual(readFileSync(path, "utf8"), source.file);
    // El preámbulo (portada) solo se indexa si el manual tiene contenido real: si no, un manual
    // todavía en plantilla aportaría un fragmento que describe lo que explicará y el asistente
    // podría responder con él sin decir nada.
    const hasContent = sections.some((section) => section.id !== "portada");
    if (!hasContent) {
      console.warn(
        `  ⚠ ${source.file}: sin contenido todavía (pendiente del cliente); no se indexa`,
      );
      continue;
    }

    for (const section of sections) {
      const parts = chunkSection(section);
      parts.forEach((part, index) => {
        chunks.push({
          id: parts.length > 1 ? `${source.slug}#${section.id}~${index + 1}` : `${source.slug}#${section.id}`,
          doc: source.slug,
          docTitle: title,
          section: section.title,
          audience: source.audience,
          source: source.file,
          text: part,
        });
      });
    }
  }
  assertNoForbidden(chunks);
  return { chunks, sourceCount: sources.length };
}

function renderModule(chunks, generatedAt, sourceCount) {
  const lines = [];
  lines.push("/**");
  lines.push(" * GENERADO por `apps/mcp/scripts/build-knowledge-index.mjs` — NO EDITAR A MANO.");
  lines.push(" *");
  lines.push(" * Regenerar con: `corepack pnpm --filter @hotel/mcp run knowledge`.");
  lines.push(` * Última generación: ${generatedAt}`);
  lines.push(" *");
  lines.push(` * Fuentes: ${sourceCount} manuales dirigidos a personas (huésped, recepción y propietario).`);
  lines.push(" *");
  lines.push(" * NO incluye documentación técnica interna a propósito: contiene credenciales de ejemplo");
  lines.push(" * (el guardián de secretos D-04 lo prohíbe dentro de `apps/`) y el MCP se despliega con");
  lines.push(" * `--allow-unauthenticated`, de modo que la audiencia la elige quien llama. Ver el");
  lines.push(" * encabezado del generador para el razonamiento completo.");
  lines.push(" */");
  lines.push("");
  lines.push("/** Audiencia de un fragmento; de menor a mayor privilegio. */");
  lines.push('export type KnowledgeAudience = "cliente" | "recepcion" | "propietario" | "interno";');
  lines.push("");
  lines.push("export interface KnowledgeChunk {");
  lines.push("  readonly id: string;          // <slug>#<seccion>[~n]");
  lines.push("  readonly doc: string;         // slug del documento");
  lines.push("  readonly docTitle: string;    // H1 del documento");
  lines.push("  readonly section: string;     // título de la sección (para citar, RF-59)");
  lines.push("  readonly audience: KnowledgeAudience;");
  lines.push("  readonly source: string;      // ruta relativa del fichero fuente");
  lines.push("  readonly text: string;        // texto plano indexado");
  lines.push("}");
  lines.push("");
  lines.push("export const KNOWLEDGE_CHUNKS: readonly KnowledgeChunk[] = [");
  for (const chunk of chunks) {
    lines.push("  {");
    lines.push(`    id: ${JSON.stringify(chunk.id)},`);
    lines.push(`    doc: ${JSON.stringify(chunk.doc)},`);
    lines.push(`    docTitle: ${JSON.stringify(chunk.docTitle)},`);
    lines.push(`    section: ${JSON.stringify(chunk.section)},`);
    lines.push(`    audience: ${JSON.stringify(chunk.audience)},`);
    lines.push(`    source: ${JSON.stringify(chunk.source)},`);
    lines.push(`    text: ${JSON.stringify(chunk.text)},`);
    lines.push("  },");
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const { chunks, sourceCount } = buildChunks();
  const byAudience = chunks.reduce((acc, chunk) => {
    acc[chunk.audience] = (acc[chunk.audience] ?? 0) + 1;
    return acc;
  }, {});

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, renderModule(chunks, new Date().toISOString().slice(0, 10), sourceCount));

  console.log(
    `✅ Índice de conocimiento: ${chunks.length} fragmentos de ${sourceCount} manuales ` +
      `(${Object.entries(byAudience)
        .map(([audience, total]) => `${audience}: ${total}`)
        .join(" · ")})`,
  );
}

try {
  main();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
