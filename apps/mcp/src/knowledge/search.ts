import { KNOWLEDGE_CHUNKS, type KnowledgeAudience, type KnowledgeChunk } from "./index.generated";

/**
 * Recuperación léxica (BM25) sobre el índice de conocimiento del hotel, **en memoria y sin base de
 * datos**. Decisión de la v3 (`RepoTecnico/propuesta_v3_asistente_ia.md` §5.5): el corpus son tres
 * manuales, así que un índice vectorial con `pgvector` añadiría migración, latencia de red y carga
 * sobre Cloud SQL a cambio de nada. Aquí se precalcula una vez por proceso y por audiencia.
 *
 * El **filtro por audiencia** es estructural: el asistente del huésped consulta con `cliente` (por
 * defecto) y el índice solo construye, para esa audiencia, los fragmentos que puede ver. No depende
 * de que el prompt se porte bien.
 *
 * El índice **no contiene documentación interna** a propósito; el porqué está documentado en
 * `apps/mcp/scripts/build-knowledge-index.mjs` (guardián de secretos D-04 + MCP con
 * `--allow-unauthenticated`). `interno` se mantiene en la escalera como nivel máximo para una futura
 * superficie autenticada, pero hoy no aporta fragmentos.
 */

export type { KnowledgeAudience };

/**
 * Escalera de privilegio: qué fragmentos ve cada consumidor. Un huésped nunca recibe contenido de
 * recepción, propietario o interno; recepción sí ve lo de cliente (el mismo material que el huésped),
 * y `interno` lo ve todo (es el personal técnico del proyecto).
 */
export const VISIBLE_AUDIENCES: Readonly<Record<KnowledgeAudience, readonly KnowledgeAudience[]>> = {
  cliente: ["cliente"],
  recepcion: ["cliente", "recepcion"],
  propietario: ["cliente", "propietario"],
  interno: ["cliente", "recepcion", "propietario", "interno"],
};

/** Audiencia por defecto: la más restrictiva, para que un descuido no filtre contenido interno. */
export const DEFAULT_AUDIENCE: KnowledgeAudience = "cliente";
export const DEFAULT_LIMIT = 3;

/**
 * Sinónimos del vocabulario del hotel, aplicados a la consulta.
 *
 * Motivo medido (H5): el huésped —y el propio modelo al reformular— pregunta por la «**comisión**»,
 * pero el corpus dice «**porcentaje**» y «lo que se queda el hotel». Sin coincidencia léxica, la
 * búsqueda devolvía fragmentos sin la cifra y el asistente respondía sin el dato (o lo negaba). Con la
 * expansión, el fragmento con el 5 %/10 % pasa al primer puesto.
 *
 * Es una lista cerrada y revisable: añadir un sinónimo solo amplía la consulta, nunca cambia los
 * pesos del índice.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  comision: ["porcentaje"],
  comisiones: ["porcentaje"],
  royalty: ["porcentaje"],
  porcentaje: ["comision"],
  cancelacion: ["anular", "devolucion"],
  anular: ["cancelacion"],
  factura: ["cuenta", "cargo"],
  resguardo: ["qr", "token"],
};
/** Tope de resultados: cada uno viaja al LLM en cada llamada (palanca de coste, RNF-24). */
export const MAX_LIMIT = 5;
/** Recorte del extracto devuelto: contexto suficiente para responder y citar (RF-59). */
export const MAX_EXCERPT_CHARS = 600;

export interface KnowledgeHit {
  readonly id: string;
  readonly doc: string;
  readonly docTitle: string;
  /** Sección concreta: es lo que el asistente cita como fuente. */
  readonly section: string;
  readonly source: string;
  readonly score: number;
  readonly excerpt: string;
}

export interface SearchKnowledgeOptions {
  readonly audience?: KnowledgeAudience;
  readonly limit?: number;
}

export function isKnowledgeAudience(value: unknown): value is KnowledgeAudience {
  return typeof value === "string" && value in VISIBLE_AUDIENCES;
}

/**
 * Pesos por campo (BM25F). Un término que aparece en el **título del documento** es una señal mucho
 * más fuerte que el mismo término perdido en el cuerpo; sin esta ponderación, una sección de
 * preguntas frecuentes —densa en vocabulario— adelantaba al manual que realmente responde.
 */
const FIELD_WEIGHTS = { docTitle: 3, section: 2, body: 1 } as const;

/** Un fragmento indexado: sus términos con frecuencia ponderada y su longitud ponderada. */
interface IndexedChunk {
  readonly chunk: KnowledgeChunk;
  /** Frecuencia ponderada por campo: `docTitle·3 + section·2 + body·1`. */
  readonly termFrequency: ReadonlyMap<string, number>;
  /** Longitud ponderada con los mismos pesos, para la normalización de BM25F. */
  readonly length: number;
}

interface Bm25Index {
  readonly chunks: readonly IndexedChunk[];
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly averageLength: number;
}

/** Constantes estándar de BM25 (las de facto en Lucene/Elasticsearch). */
const K1 = 1.2;
const B = 0.75;

/**
 * Palabras vacías del español. Sin listas de parada, «de la que» domina las puntuaciones y los
 * fragmentos relevantes se hunden.
 */
const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "u", "que", "en", "con",
  "por", "para", "sin", "sobre", "al", "del", "se", "su", "sus", "es", "son", "esta", "este",
  "esto", "estas", "estos", "como", "mas", "pero", "si", "no", "ni", "lo", "le", "les", "me", "te",
  "nos", "yo", "tu", "mis", "mi", "he", "ha", "han", "hay", "ser", "fue", "era", "muy", "ya",
  "tambien", "tiene", "tienen", "puede", "pueden", "cuando", "donde", "quien", "cual", "cuales",
  "como", "todo", "toda", "todos", "todas", "otro", "otra", "hacer", "hace", "asi", "ese", "esa",
  "eso", "esos", "esas", "aquel", "aquella", "desde", "hasta", "entre", "cada", "tanto", "tan",
  "solo", "aun", "porque", "aunque", "mientras", "segun", "tras", "hacia", "durante", "mediante",
  "al", "va", "van", "ver", "sea", "sean", "fue", "sera", "seran", "hay", "debe", "deben",
]);

/**
 * Terminaciones que en español forman el plural añadiendo «es» a una palabra terminada en
 * consonante («habitación» → «habitaciones», «hotel» → «hoteles», «color» → «colores»). El resto de
 * palabras acabadas en «s» son plurales que solo añadieron «s» («mensaje» → «mensajes»,
 * «noche» → «noches»), y ahí quitar «es» daría un falso lexema («mensaj»).
 */
const CONSONANT_PLURALS = [
  "ones", "anes", "ines", "enes", "otes", "ales", "eles", "iles", "oles", "ores", "ares", "eres",
  "eses", "udes", "ades", "ides",
];

/**
 * Normaliza un término: minúsculas, sin acentos y sin plural. La singularización es deliberadamente
 * conservadora y heurística (no es un lematizador): sin ella, «habitaciones» no encontraría
 * «habitación» y la recuperación en español se degrada; con una agresiva, se mezclarían términos
 * distintos. Aplica la MISMA regla a la consulta y a los documentos, que es lo que hace que las dos
 * formas colapsen en el mismo lexema.
 */
export function normalizeTerm(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (base.length < 5 || !base.endsWith("s")) return base;
  // Invariables y palabras que ya acaban en «s» sin ser plural.
  if (base.endsWith("ss") || base.endsWith("is") || base.endsWith("us")) return base;
  // Irregulares en «-ces» → «-z»: veces→vez, luces→luz, lápices→lápiz, peces→pez, cruces→cruz.
  // Sin esta regla, el fallback daría «vece»/«luce»/«lapice» y no casarían con el singular.
  if (base.length > 4 && base.endsWith("ces")) return `${base.slice(0, -3)}z`;
  if (CONSONANT_PLURALS.some((ending) => base.endsWith(ending))) return base.slice(0, -2);
  return base.slice(0, -1);
}

/** Trocea un texto en términos indexables (sin palabras vacías ni términos de una letra). */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const term = normalizeTerm(raw);
    if (term.length < 2 || STOPWORDS.has(term)) continue;
    terms.push(term);
  }
  return terms;
}

/** Suma los términos de un campo al mapa de frecuencias con su peso. */
function addFieldTerms(frequency: Map<string, number>, text: string, weight: number): void {
  for (const term of tokenize(text)) {
    frequency.set(term, (frequency.get(term) ?? 0) + weight);
  }
}

function indexChunk(chunk: KnowledgeChunk): IndexedChunk {
  const frequency = new Map<string, number>();
  addFieldTerms(frequency, chunk.docTitle, FIELD_WEIGHTS.docTitle);
  addFieldTerms(frequency, chunk.section, FIELD_WEIGHTS.section);
  addFieldTerms(frequency, chunk.text, FIELD_WEIGHTS.body);

  // La longitud ponderada es la suma de las frecuencias ponderadas: es exactamente el número de
  // términos del fragmento contando cada campo con su peso.
  let length = 0;
  for (const weight of frequency.values()) length += weight;
  return { chunk, termFrequency: frequency, length };
}

/** Construye el índice BM25 de una audiencia (solo los fragmentos que esa audiencia puede ver). */
function buildIndex(audience: KnowledgeAudience): Bm25Index {
  const visible = new Set(VISIBLE_AUDIENCES[audience]);
  const chunks = KNOWLEDGE_CHUNKS.filter((chunk) => visible.has(chunk.audience)).map(indexChunk);
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;
  for (const indexed of chunks) {
    totalLength += indexed.length;
    for (const term of indexed.termFrequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return {
    chunks,
    documentFrequency,
    averageLength: chunks.length > 0 ? totalLength / chunks.length : 0,
  };
}

/** Índices memoizados: se construyen a la primera consulta de cada audiencia, no al arrancar. */
const indexCache = new Map<KnowledgeAudience, Bm25Index>();

export function getIndex(audience: KnowledgeAudience): Bm25Index {
  const cached = indexCache.get(audience);
  if (cached) return cached;
  const built = buildIndex(audience);
  indexCache.set(audience, built);
  return built;
}

/** idf de Robertson/Sparck Jones, en la variante que evita valores negativos. */
function inverseDocumentFrequency(total: number, documentFrequency: number): number {
  return Math.log(1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function score(index: Bm25Index, indexed: IndexedChunk, queryTerms: readonly string[]): number {
  const total = index.chunks.length;
  let score_ = 0;
  for (const term of new Set(queryTerms)) {
    const frequency = indexed.termFrequency.get(term);
    if (!frequency) continue;
    const df = index.documentFrequency.get(term) ?? 0;
    const normalization =
      index.averageLength > 0 ? 1 - B + (B * indexed.length) / index.averageLength : 1;
    score_ +=
      inverseDocumentFrequency(total, df) *
      ((frequency * (K1 + 1)) / (frequency + K1 * normalization));
  }
  return score_;
}

/**
 * Amplía los términos de la consulta con sus sinónimos. No duplica términos y mantiene el orden
 * original, de modo que la puntuación sigue siendo determinista.
 */
export function expandSynonyms(terms: readonly string[]): string[] {
  const expanded = [...terms];
  for (const term of terms) {
    for (const synonym of SYNONYMS[term] ?? []) {
      if (!expanded.includes(synonym)) expanded.push(synonym);
    }
  }
  return expanded;
}

/** Recorta a `max` caracteres sin partir la última palabra. */
export function excerpt(text: string, max: number = MAX_EXCERPT_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Busca en el conocimiento visible para la audiencia pedida y devuelve los mejores fragmentos.
 *
 * Es determinista: a igual puntuación ordena por `id`, de modo que los tests no dependen del orden
 * de inserción ni de la estabilidad de `Array.prototype.sort`.
 */
export function searchKnowledge(query: string, options: SearchKnowledgeOptions = {}): KnowledgeHit[] {
  const audience = options.audience ?? DEFAULT_AUDIENCE;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const queryTerms = expandSynonyms(tokenize(query));
  if (queryTerms.length === 0) return [];

  const index = getIndex(audience);
  const scored: KnowledgeHit[] = [];
  for (const indexed of index.chunks) {
    const value = score(index, indexed, queryTerms);
    if (value <= 0) continue;
    scored.push({
      id: indexed.chunk.id,
      doc: indexed.chunk.doc,
      docTitle: indexed.chunk.docTitle,
      section: indexed.chunk.section,
      source: indexed.chunk.source,
      score: Number(value.toFixed(4)),
      excerpt: excerpt(indexed.chunk.text),
    });
  }

  // Una sección larga se parte en varios fragmentos (`…~1`, `…~2`): sin deduplicar, dos trozos de la
  // MISMA sección ocupan dos de los tres huecos y desplazan a otros manuales. Se conserva el mejor
  // fragmento de cada sección y se comparan secciones entre sí.
  const bestBySection = new Map<string, KnowledgeHit>();
  for (const hit of scored) {
    const key = hit.id.split("~")[0] as string;
    const current = bestBySection.get(key);
    if (!current || hit.score > current.score) bestBySection.set(key, hit);
  }

  const ranked = [...bestBySection.values()];
  ranked.sort((a, b) => (b.score === a.score ? a.id.localeCompare(b.id) : b.score - a.score));
  return ranked.slice(0, limit);
}
