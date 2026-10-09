import type { NightType } from "@hotel/shared/domain";

/**
 * Filtros del catálogo **transportables por URL** (RF-12/CU-08 §9, incremento v4).
 *
 * El asistente no pinta los resultados en su propio panel: ejecuta la búsqueda contra el MCP y
 * **navega** al catálogo con el filtro ya aplicado, de modo que las noches se ven en la página
 * real (con su foto, precio y botón de compra). Para que ese salto sea compartible, enlazable y
 * verificable, el filtro vive en la `query string` y este módulo es su única traducción:
 * `parseCatalogSearch` (URL → estado) y `buildCatalogHref` (estado → URL).
 *
 * Es código puro y sin dependencias de React: la página lo usa en servidor y el widget en cliente.
 */

/** Estado de filtros que viaja en la URL de `/catalogo`. */
export interface CatalogSearch {
  /** Tipo de habitación; `null` = todos. */
  readonly type: NightType | null;
  /** Fecha inicial `AAAA-MM-DD`; cadena vacía = sin acotar. */
  readonly from: string;
  /** Fecha final `AAAA-MM-DD`; cadena vacía = sin acotar. */
  readonly to: string;
  /** Número de habitación buscado; cadena vacía = sin buscar. */
  readonly room: string;
}

export const EMPTY_CATALOG_SEARCH: CatalogSearch = { type: null, from: "", to: "", room: "" };

const TYPES: readonly NightType[] = ["simple", "doble", "suite"];
/** `AAAA-MM-DD` con mes y día plausibles (`2026-13-45` no pasa). */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** El buscador del catálogo filtra por número de habitación (pocos dígitos). */
const MAX_ROOM_LENGTH = 8;

/** Parámetros de la `query string` tal como los entrega Next (`string | string[] | undefined`). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro repetido (`?tipo=a&tipo=b` → `a`). */
function firstValue(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

/** `true` si el texto es una fecha `AAAA-MM-DD` con mes 1–12 y día 1–31. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * `AAAAMMDD` (el formato del MCP y de la cadena) → `AAAA-MM-DD` (el del `<input type="date">`).
 * Devuelve `null` si no es un entero de 8 dígitos con mes y día plausibles.
 */
export function yyyymmddToIso(value: unknown): string | null {
  const digits =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : typeof value === "string" && /^\d{8}$/.test(value.trim())
        ? value.trim()
        : null;
  if (digits === null) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return isIsoDate(iso) ? iso : null;
}

/** El catálogo entero, sin filtros. */
export function isEmptyCatalogSearch(search: CatalogSearch): boolean {
  return search.type === null && search.from === "" && search.to === "" && search.room === "";
}

/**
 * Normaliza la `query string` a un filtro válido. Todo lo que no encaje se **descarta en silencio**
 * (un enlace manipulado no debe romper el catálogo ni filtrar por un tipo inexistente).
 */
export function parseCatalogSearch(params: RawSearchParams | undefined): CatalogSearch {
  const type = firstValue(params?.tipo);
  const from = firstValue(params?.desde).trim();
  const to = firstValue(params?.hasta).trim();
  const room = firstValue(params?.buscar).trim();

  return {
    type: TYPES.includes(type as NightType) ? (type as NightType) : null,
    from: isIsoDate(from) ? from : "",
    to: isIsoDate(to) ? to : "",
    room: room.length > 0 && room.length <= MAX_ROOM_LENGTH ? room : "",
  };
}

/**
 * Estado → URL del catálogo. Omite los filtros vacíos, así que el catálogo sin filtros es
 * `/catalogo` y el resultado es estable (mismo estado ⇒ misma URL ⇒ misma clave de React).
 */
export function buildCatalogHref(search: CatalogSearch): string {
  const query = new URLSearchParams();
  if (search.type !== null) query.set("tipo", search.type);
  if (search.from !== "") query.set("desde", search.from);
  if (search.to !== "") query.set("hasta", search.to);
  if (search.room !== "") query.set("buscar", search.room);
  const qs = query.toString();
  return qs === "" ? "/catalogo" : `/catalogo?${qs}`;
}

/**
 * Piezas legibles del filtro activo, en orden (tipo, fechas, habitación). No traduce: devuelve
 * claves y valores para que la página componga el texto con `next-intl`.
 */
export function describeCatalogSearch(
  search: CatalogSearch,
): readonly { readonly kind: "type" | "dates" | "room"; readonly value: string }[] {
  const parts: { kind: "type" | "dates" | "room"; value: string }[] = [];
  if (search.type !== null) parts.push({ kind: "type", value: search.type });
  if (search.from !== "" || search.to !== "") {
    parts.push({ kind: "dates", value: `${search.from}|${search.to}` });
  }
  if (search.room !== "") parts.push({ kind: "room", value: search.room });
  return parts;
}

/**
 * Estado COMPLETO de la parrilla del catálogo: el filtro transportable por URL más los dos que solo
 * existen en pantalla (mes, precio máximo) y que el asistente no necesita para responder.
 */
export interface CatalogGridFilters {
  readonly type: NightType | "all";
  readonly month: number | null;
  readonly maxPriceWei: bigint | null;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly search: string;
}

export const EMPTY_GRID_FILTERS: CatalogGridFilters = {
  type: "all",
  month: null,
  maxPriceWei: null,
  dateFrom: "",
  dateTo: "",
  search: "",
};

/**
 * Filtro de URL → estado inicial de la parrilla. Así los resultados que el asistente deja en la
 * página **aparecen ya filtrados al primer render** (sin parpadeo ni un efecto de arranque).
 */
export function gridFiltersFromSearch(search: CatalogSearch): CatalogGridFilters {
  return {
    type: search.type ?? "all",
    month: null,
    maxPriceWei: null,
    dateFrom: search.from,
    dateTo: search.to,
    search: search.room,
  };
}
