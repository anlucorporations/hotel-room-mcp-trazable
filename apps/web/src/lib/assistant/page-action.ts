import type { NightType } from "@hotel/shared/domain";
import {
  buildCatalogHref,
  yyyymmddToIso,
  type CatalogSearch,
} from "@/lib/catalog-search";

/**
 * Traducción de las **consultas del asistente** a una acción sobre la plataforma (incremento v4).
 *
 * El asistente no dibuja las noches en su panel: cuando consulta disponibilidad, la plataforma
 * **muestra el resultado en la página**. Esta función es la pieza que decide *qué página* y *con
 * qué filtro*: recibe las herramientas de dominio que el LLM ejecutó —y que el orquestador solo
 * registra cuando han **respondido con éxito**— y devuelve la navegación correspondiente.
 *
 * Se deriva de la **entrada real de la herramienta**, no de la prosa del modelo: es determinista,
 * no se puede inyectar por prompt y se prueba sin LLM (ADR-23).
 */

/** Herramienta de dominio ejecutada con éxito, con la entrada con la que se invocó. */
export interface AssistantToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** Acción de interfaz que el cliente ejecuta tras la respuesta del asistente. */
export interface AssistantPageAction {
  /** Destino: hoy, el catálogo filtrado. */
  readonly kind: "catalog";
  /** URL lista para `router.push`. */
  readonly href: string;
  /** Filtro estructurado que aplica esa URL (mismo contrato que la `query string`). */
  readonly search: CatalogSearch;
}

/** Herramientas que *consultan catálogo*: son las únicas que mueven al usuario de página. */
const CATALOG_TOOLS = new Set(["listAvailableNights", "checkAvailability"]);

const TYPES: readonly NightType[] = ["simple", "doble", "suite"];

const asType = (value: unknown): NightType | null =>
  typeof value === "string" && TYPES.includes(value as NightType) ? (value as NightType) : null;

/** `window` del MCP: `{ from?: AAAAMMDD, to?: AAAAMMDD }`, sin `from > to` (se ignora el rango invertido). */
function windowOf(input: Record<string, unknown>): { from: string; to: string } {
  const raw = input.window;
  if (typeof raw !== "object" || raw === null) return { from: "", to: "" };
  const from = yyyymmddToIso((raw as Record<string, unknown>).from) ?? "";
  const to = yyyymmddToIso((raw as Record<string, unknown>).to) ?? "";
  if (from !== "" && to !== "" && from > to) return { from: to, to: from };
  return { from, to };
}

/** Filtro de catálogo que implica una herramienta; `null` si la herramienta no consulta catálogo. */
export function catalogSearchOf(call: AssistantToolCall): CatalogSearch | null {
  if (call.name === "listAvailableNights") {
    const { from, to } = windowOf(call.input);
    return { type: asType(call.input.type), from, to, room: "" };
  }
  if (call.name === "checkAvailability") {
    const date = yyyymmddToIso(call.input.date) ?? "";
    const room = call.input.room;
    return {
      type: null,
      from: date,
      to: date,
      // El número de habitación se transporta como texto (la URL no distingue tipos).
      room: typeof room === "number" || typeof room === "string" ? String(room) : "",
    };
  }
  return null;
}

/**
 * Acción de página de un turno. Decide en este orden:
 *
 * 1. **Compra preparada → no se navega.** Medido en producción el 2026-10-10 (v47): el flujo correcto
 *    de compra usa DOS herramientas (`checkAvailability` → `buildPurchaseTx`) y `checkAvailability`
 *    es de catálogo, así que generaba acción de página; el widget navegaba y cerraba el panel **en el
 *    mismo turno en que llegaba la compra**, y el usuario nunca veía el panel de firma. La compra es
 *    el siguiente paso del usuario: manda sobre la navegación.
 * 2. **Consulta de catálogo del modelo → su acción** (con los filtros reales).
 * 3. **El usuario pidió habitaciones y el modelo no consultó el catálogo → se abre el catálogo**
 *    (filtrado por el tipo que haya nombrado). Es la garantía de que la búsqueda se ve en la ventana
 *    aunque el modelo responda de memoria.
 */
export function pageActionForTurn(turn: {
  readonly toolCalls: readonly AssistantToolCall[];
  readonly preparedPurchase: unknown | null;
  /** Último mensaje del usuario del turno; habilita el respaldo por intención. */
  readonly userText?: string;
}): AssistantPageAction | null {
  if (turn.preparedPurchase) return null;
  const derived = derivePageAction(turn.toolCalls);
  if (derived) return derived;
  if (!turn.userText || !wantsRoomSearch(turn.userText)) return null;
  const search: CatalogSearch = {
    type: roomTypeFromText(turn.userText),
    from: "",
    to: "",
    room: "",
  };
  return { kind: "catalog", href: buildCatalogHref(search), search };
}

/**
 * ¿El usuario pidió una **búsqueda de habitaciones**? (petición del responsable, 2026-10-10: «que
 * cuando se solicita una búsqueda de habitaciones se muestre en la ventana del navegador»).
 *
 * Es el respaldo **determinista** para cuando el modelo no llega a consultar el catálogo (responde de
 * memoria o su herramienta falla): sin él no habría `pageAction` y el usuario se quedaría con el
 * texto, sin ver nada en la página.
 *
 * Exige señales de **habitación o tipo** (`habitaci…`, `sencill…`, `doble`, `suite`) junto a una de
 * **búsqueda o disponibilidad** (`hay`, `disponib…`, `libre`, `cuál`, `busca`, `muestra`…) —o,
 * directamente, una palabra de disponibilidad—, de modo que una duda de manual («¿cómo pongo mi noche
 * en reventa?», «¿cuántas noches tengo?») **no** mueva al usuario de página.
 */
export function wantsRoomSearch(text: string): boolean {
  const room = /habitaci|cuarto|sencill|simple|doble|suite/i.test(text);
  // Ojo con las tildes: «muéstrame» NO contiene «muestra» (la é rompe la coincidencia), así que los
  // verbos se escriben con su vocal acentuada opcional.
  const search =
    /disponib|libre|hay|cu[aá]l|cu[aá]nt|busca|mu[eé]stra|ens[eé]|ver\b|lista|opci|precio|cuesta/i.test(
      text,
    );
  return (room && search) || /disponib|\blibre/i.test(text);
}

/** Tipo de habitación nombrado en el texto, si se nombra uno (para el respaldo por intención). */
export function roomTypeFromText(text: string): NightType | null {
  if (/suite/i.test(text)) return "suite";
  if (/doble/i.test(text)) return "doble";
  if (/sencill|simple/i.test(text)) return "simple";
  return null;
}

/**
 * Acción de página de un turno: la **última** consulta de catálogo ejecutada manda (si el modelo
 * encadena varias, se navega a la más reciente, que es la que responde al usuario). `null` cuando
 * el turno no consultó el catálogo —una duda de manuales, por ejemplo— y no debe mover la pantalla.
 */
export function derivePageAction(
  toolCalls: readonly AssistantToolCall[],
): AssistantPageAction | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const call = toolCalls[i]!;
    if (!CATALOG_TOOLS.has(call.name)) continue;
    const search = catalogSearchOf(call);
    if (search === null) continue;
    return { kind: "catalog", href: buildCatalogHref(search), search };
  }
  return null;
}
