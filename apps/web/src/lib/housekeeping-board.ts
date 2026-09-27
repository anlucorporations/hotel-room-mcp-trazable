/**
 * Utilidades del tablero de Housekeeping (F3 · D-30, D-48, D-62).
 *
 * Se separan del route handler para poder probarlas sin red: la **firma** del tablero es lo que
 * decide si el flujo SSE emite un evento (solo cuando algo cambió), y el parseo de fechas y turnos
 * es el contrato de entrada de la API.
 *
 * Es **isomorfo a propósito**: no importa el barril raíz de `@hotel/shared` (que arrastra `pg` y
 * BullMQ), de modo que puede usarse también desde componentes de cliente. La firma solo necesita la
 * forma estructural del tablero, no el tipo nominal del servidor.
 */

/** Forma mínima de un tablero para calcular su firma (subconjunto de `HousekeepingBoard`). */
export interface BoardLike {
  readonly date?: string;
  readonly shifts?: readonly { id: string }[];
  readonly assignments?: readonly { id: string; assignee: string; status: string }[];
  readonly lowStock?: readonly { code: string; stockQty: number; thresholdQty: number }[];
}

/** Fecha por defecto del tablero: hoy en formato `YYYY-MM-DD`. */
export function defaultBoardDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ¿Es una fecha ISO `YYYY-MM-DD` válida y real (rechaza 2026-02-31)? */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Etiquetas de turno del tablero (mismo vocabulario que `housekeeping_shifts.label`). */
export type HousekeepingShiftLabel = "MANANA" | "TARDE" | "NOCHE";

const SHIFT_LABELS: readonly HousekeepingShiftLabel[] = ["MANANA", "TARDE", "NOCHE"];

/** Normaliza la etiqueta de turno aceptando también `mañana`/`tarde`/`noche`. */
export function parseShiftLabel(value: unknown): HousekeepingShiftLabel | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return (SHIFT_LABELS as readonly string[]).includes(normalized)
    ? (normalized as HousekeepingShiftLabel)
    : null;
}

/**
 * Firma estable del tablero: todo lo que cambia lo que ve el personal, sin `generatedAt`. El SSE
 * compara firmas y solo emite cuando es distinta, de modo que un cambio se refleja en el siguiente
 * sondeo (≤2 s, D-30).
 */
export function boardSignature(board: BoardLike | null | undefined): string {
  const assignments = (board?.assignments ?? [])
    .map((assignment) => `${assignment.id}:${assignment.assignee}:${assignment.status}`)
    .sort();
  const lowStock = (board?.lowStock ?? [])
    .map((item) => `${item.code}:${item.stockQty}:${item.thresholdQty}`)
    .sort();
  return JSON.stringify({
    date: board?.date ?? "",
    shifts: (board?.shifts ?? []).map((shift) => shift.id),
    assignments,
    lowStock,
  });
}
