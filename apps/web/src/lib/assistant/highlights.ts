import { decodeTokenId, roomTypeOf, type NightType } from "@hotel/shared/domain";

/**
 * **Noches destacadas del turno** (petición del responsable, 2026-10-11): el formato amigable de las
 * respuestas que hablan de habitaciones.
 *
 * El texto que redacta el modelo es libre —y llegaba como una lista de asteriscos sin orden ni
 * jerarquía—, así que la información **estructurada** que ya devolvieron las herramientas del catálogo
 * se conserva en la respuesta y el panel la pinta como tarjetas ordenadas, con su tipo, su fecha y su
 * precio, y un botón para preparar la reserva de esa noche concreta.
 *
 * Es un módulo **puro**: tolera las dos formas en las que puede llegar el resultado (la lista de
 * `listAvailableNights` y el objeto de `checkAvailability`), descarta lo que no tenga forma de noche y
 * ordena por fecha, tipo y habitación para que la oferta se lea de un vistazo.
 */

/** Tope de tarjetas por turno: más que esto no se lee, y el panel vive en un flotante. */
export const MAX_HIGHLIGHTS = 6;

/** Una noche ofrecible, ya normalizada para pintarla. */
export interface NightHighlight {
  readonly tokenId: string;
  readonly room: number | null;
  readonly type: NightType | null;
  readonly dateYYYYMMDD: number | null;
  readonly priceWei: string | null;
  readonly saleType: string | null;
}

const NIGHT_TYPES: readonly NightType[] = ["simple", "doble", "suite"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  // Un `bigint` solo aparece si el resultado llega sin pasar por JSON (el MCP lo serializa a texto).
  if (typeof value === "bigint") return value.toString();
  return null;
}

function asType(value: unknown): NightType | null {
  return typeof value === "string" && (NIGHT_TYPES as readonly string[]).includes(value)
    ? (value as NightType)
    : null;
}

/** `tokenId` (habitación·fecha) → `{ room, dateYYYYMMDD }`, o `null` si no tiene forma numérica. */
function decodeNightToken(tokenId: string): { room: number; dateYYYYMMDD: number } | null {
  if (!/^\d{5,}$/.test(tokenId)) return null;
  try {
    return decodeTokenId(BigInt(tokenId));
  } catch {
    return null;
  }
}

/** Normaliza un descriptor de noche; `null` si no tiene ni tokenId (nada que ofrecer). */
function toHighlight(value: unknown): NightHighlight | null {
  if (!isRecord(value)) return null;
  const tokenId = asString(value.tokenId);
  if (tokenId === null) return null;
  let room = asNumber(value.room);
  let dateYYYYMMDD = asNumber(value.dateYYYYMMDD);
  let type = asType(value.type);
  // `checkAvailability` solo devuelve `{tokenId, priceWei, saleType}`: habitación y fecha viven en el
  // tokenId. Sin esto, la tarjeta salía sin habitación/fecha y el fallback determinista del
  // asistente no podía decir qué noche era (defecto visto en el pool E2E del 2026-10-24).
  if (room === null || dateYYYYMMDD === null || type === null) {
    const decoded = decodeNightToken(tokenId);
    if (decoded !== null) {
      room ??= decoded.room;
      dateYYYYMMDD ??= decoded.dateYYYYMMDD;
      type ??= roomTypeOf(decoded.room);
    }
  }
  return {
    tokenId,
    room,
    type,
    dateYYYYMMDD,
    priceWei: asString(value.priceWei),
    saleType: asString(value.saleType),
  };
}

/**
 * Noches destacadas que aporta **una** herramienta del catálogo:
 *   · `listAvailableNights` → la lista completa (se acepta también `{ nights: [...] }`);
 *   · `checkAvailability` → una sola noche, y solo si está **disponible** (si no, no hay nada que
 *     ofrecer: el mensaje del asistente explicará por qué).
 */
export function highlightsFromToolResult(toolName: string, result: unknown): NightHighlight[] {
  if (toolName === "listAvailableNights") {
    const list = Array.isArray(result)
      ? result
      : isRecord(result) && Array.isArray(result.nights)
        ? result.nights
        : [];
    return list.map(toHighlight).filter((night): night is NightHighlight => night !== null);
  }

  if (toolName === "checkAvailability") {
    if (!isRecord(result) || result.available !== true) return [];
    const night = toHighlight(result);
    return night === null ? [] : [night];
  }

  return [];
}

/** Orden de lectura: por fecha, luego por tipo y por número de habitación (los nulos, al final). */
function compareHighlights(a: NightHighlight, b: NightHighlight): number {
  const fecha = (a.dateYYYYMMDD ?? Number.MAX_SAFE_INTEGER) - (b.dateYYYYMMDD ?? Number.MAX_SAFE_INTEGER);
  if (fecha !== 0) return fecha;
  const tipo = (a.type ?? "zzz").localeCompare(b.type ?? "zzz");
  if (tipo !== 0) return tipo;
  return (a.room ?? Number.MAX_SAFE_INTEGER) - (b.room ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Acumula las noches de un turno (varias herramientas pueden aportar) sin repetir y ordenadas.
 * Se queda con las de **antes** en caso de empate de tokenId: el dato más reciente no debe desplazar
 * al que ya se estaba mostrando.
 */
export function mergeHighlights(
  current: readonly NightHighlight[],
  incoming: readonly NightHighlight[],
  cap: number = MAX_HIGHLIGHTS,
): NightHighlight[] {
  const byToken = new Map<string, NightHighlight>();
  for (const night of [...current, ...incoming]) {
    if (!byToken.has(night.tokenId)) byToken.set(night.tokenId, night);
  }
  return [...byToken.values()].sort(compareHighlights).slice(0, Math.max(0, cap));
}

/**
 * Normaliza un valor **no confiable** (lo que llega del API o de la memoria del hilo) a una lista de
 * noches: descarta lo que no tenga forma de noche, quita repetidas y acota el número. Se usa al
 * recibir la respuesta y al leer `sessionStorage` —donde el contenido pudo manipularse o ser de otra
 * versión—, para que nada raro llegue al render.
 */
export function sanitizeHighlights(value: unknown, cap: number = MAX_HIGHLIGHTS): NightHighlight[] {
  if (!Array.isArray(value)) return [];
  const nights = value
    .map(toHighlight)
    .filter((night): night is NightHighlight => night !== null);
  return mergeHighlights([], nights, cap);
}
