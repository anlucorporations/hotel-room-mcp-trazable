/**
 * Lógica **pura** del calendario mensual de publicaciones y ocupación de una habitación
 * (2026-10-02).
 *
 * Por qué vive aparte del componente: la rejilla del mes y la clasificación de cada día son
 * aritmética de fechas UTC, no presentación. Aislarlas aquí permite probarlas sin navegador ni
 * React —y sin depender de la zona horaria de quien ejecuta la suite—, que es justo lo que exige
 * la ficha de habitación reutilizable (panel, recepción, housekeeping, mantenimiento y web
 * pública comparten este mismo cálculo).
 *
 * Reglas de negocio fijadas (decisión del responsable):
 *   - Un día está **publicado** si cae dentro de alguna ventana `[publishedAt, unpublishedAt]`,
 *     comparando por **fecha UTC**. `unpublishedAt === null` es una ventana **abierta** (publicada
 *     indefinidamente). Los dos extremos son **inclusive**: el día de retirada cuenta como
 *     publicado ese día, que es como lo lee el rango «publishedAt … unpublishedAt».
 *   - Un día está **reservado** si su fecha UTC está en `reservedNights`.
 *   - Las cuatro clases resultantes son `PUBLICADA`, `RESERVADA`, `AMBAS` y `LIBRE`.
 *   - La rejilla empieza en **lunes** y se completa con días de los meses vecinos (relleno).
 *
 * Este módulo **no** importa nada: ni React, ni i18n, ni dependencias de fecha. Las etiquetas
 * localizadas y los formatos de mes/día son responsabilidad de la capa de presentación
 * (`Intl.DateTimeFormat`).
 */

/** Estado de un día del calendario de una habitación. */
export type RoomCalendarState = "PUBLICADA" | "RESERVADA" | "AMBAS" | "LIBRE";

/** Ventana en la que una ficha estuvo publicada; `unpublishedAt === null` = sigue publicada. */
export interface RoomPublicationWindow {
  /** Marca ISO del alta en publicación (fecha o fecha-hora). */
  readonly publishedAt: string;
  /** Marca ISO de la retirada, o `null` si la ventana sigue abierta. */
  readonly unpublishedAt: string | null;
}

/** Celda de la rejilla mensual. */
export interface RoomCalendarDay {
  /** Fecha ISO `YYYY-MM-DD` en UTC. */
  readonly date: string;
  /** Día del mes (1–31). */
  readonly day: number;
  /** `true` si pertenece al mes pintado; `false` si es relleno de la rejilla. */
  readonly inMonth: boolean;
}

/** Recuento de días publicados y reservados de un mes. */
export interface RoomCalendarCounts {
  /** Días del mes (sin relleno) que caen en alguna ventana de publicación. */
  readonly published: number;
  /** Días del mes (sin relleno) presentes en `reservedNights`. */
  readonly reserved: number;
}

/** Año y mes (1–12) de un mes del calendario. */
export interface RoomCalendarMonthRef {
  readonly year: number;
  readonly month: number;
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/** Días que tiene un mes (1–12), correcto en años bisiestos. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Compone una fecha ISO `YYYY-MM-DD` a partir de año, mes (1–12) y día. */
export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Normaliza una marca temporal ISO a su **día UTC** (`YYYY-MM-DD`).
 *
 * Acepta tanto `2026-10-02` como `2026-10-02T23:59:59.000Z`, porque las ventanas de publicación
 * llegan de la API como fecha-hora. Devuelve `""` si no se puede interpretar.
 */
export function isoDayOf(value: string): string {
  const trimmed = value.trim();
  const match = ISO_DATE_PREFIX.exec(trimmed);
  if (match !== null) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return formatIsoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

/** Primer día UTC del mes, en milisegundos (para comparaciones de fecha). */
function firstUtcMillis(year: number, month: number): number {
  return Date.UTC(year, month - 1, 1);
}

/** Día de la semana con **lunes = 0** … domingo = 6. */
export function mondayBasedWeekday(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * ¿El día cae dentro de alguna ventana de publicación?
 *
 * Compara por fecha UTC y con los extremos **inclusive**. Las ventanas con `publishedAt` inválido
 * se ignoran; un `unpublishedAt` no nulo pero inválido se trata como ventana abierta.
 */
export function isPublishedDay(day: string, windows: readonly RoomPublicationWindow[]): boolean {
  const target = isoDayOf(day);
  if (target === "") return false;
  for (const window of windows) {
    const from = isoDayOf(window.publishedAt);
    if (from === "" || target < from) continue;
    const to = window.unpublishedAt === null ? null : isoDayOf(window.unpublishedAt);
    if (to === null || to === "" || target <= to) return true;
  }
  return false;
}

/** ¿El día está en la lista de noches reservadas? (comparación por fecha UTC). */
export function isReservedDay(day: string, reservedNights: readonly string[]): boolean {
  const target = isoDayOf(day);
  if (target === "") return false;
  return reservedNights.some((night) => isoDayOf(night) === target);
}

/** Clasifica un día en `PUBLICADA`, `RESERVADA`, `AMBAS` o `LIBRE`. */
export function classifyDay(
  day: string,
  windows: readonly RoomPublicationWindow[],
  reservedNights: readonly string[],
): RoomCalendarState {
  const published = isPublishedDay(day, windows);
  const reserved = isReservedDay(day, reservedNights);
  if (published && reserved) return "AMBAS";
  if (published) return "PUBLICADA";
  if (reserved) return "RESERVADA";
  return "LIBRE";
}

/**
 * Rejilla del mes, **empezando en lunes** y completada con los días de los meses vecinos que
 * hagan falta para cerrar semanas de siete. El número de celdas es siempre múltiplo de 7.
 */
export function buildMonthGrid(year: number, month: number): RoomCalendarDay[] {
  const total = daysInMonth(year, month);
  const lead = mondayBasedWeekday(year, month, 1);
  const cellCount = Math.ceil((lead + total) / 7) * 7;
  const days: RoomCalendarDay[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const date = new Date(firstUtcMillis(year, month) + (index - lead) * 86_400_000);
    const cellYear = date.getUTCFullYear();
    const cellMonth = date.getUTCMonth() + 1;
    const cellDay = date.getUTCDate();
    days.push({
      date: formatIsoDate(cellYear, cellMonth, cellDay),
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
    });
  }
  return days;
}

/**
 * Recuento de días **del mes pintado** (sin relleno) que están publicados y reservados.
 *
 * Un mismo día puede sumar en los dos contadores: son dos preguntas independientes («¿estuvo
 * publicado?», «¿tiene una noche vendida?»), no una partición.
 */
export function countMonthDays(
  year: number,
  month: number,
  windows: readonly RoomPublicationWindow[],
  reservedNights: readonly string[],
): RoomCalendarCounts {
  let published = 0;
  let reserved = 0;
  const total = daysInMonth(year, month);
  for (let day = 1; day <= total; day += 1) {
    const iso = formatIsoDate(year, month, day);
    if (isPublishedDay(iso, windows)) published += 1;
    if (isReservedDay(iso, reservedNights)) reserved += 1;
  }
  return { published, reserved };
}

/** Desplaza un mes `delta` posiciones (negativo = hacia atrás), sin desbordar el año. */
export function shiftMonth(year: number, month: number, delta: number): RoomCalendarMonthRef {
  const zeroBased = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (((zeroBased % 12) + 12) % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

/** Año y mes de una fecha ISO (acepta fecha-hora); `null` si no se puede interpretar. */
export function monthOfIsoDate(value: string): RoomCalendarMonthRef | null {
  const day = isoDayOf(value);
  if (day === "") return null;
  const [year, month] = day.split("-").map(Number);
  if (year === undefined || month === undefined || month < 1 || month > 12) return null;
  return { year, month };
}
