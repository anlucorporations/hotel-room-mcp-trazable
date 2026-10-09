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
