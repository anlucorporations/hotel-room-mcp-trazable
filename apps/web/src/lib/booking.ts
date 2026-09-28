/**
 * Reglas **puras** del flujo de reserva pública (propuesta de imagen visual · Fase C.2).
 *
 * Viven aquí, y no en `@hotel/shared`, porque las usa un **componente de cliente** (`BookingBar`):
 * el barril raíz arrastra `pg`/`bullmq` al navegador y la frontera está vigilada por
 * `boundaries.test.ts`. El cálculo del servidor (`nightsBetween` del repositorio de reservas) y este
 * deben coincidir: hay una prueba que **cruza las dos implementaciones** para que el resumen que ve
 * el huésped no pueda separarse de lo que se le cobra.
 */

const DAY_MS = 86_400_000;

/** ISO `AAAA-MM-DD` de una fecha local desplazada `offsetDays`. */
export function isoDate(offsetDays = 0, now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** ¿Es una fecha ISO con forma `AAAA-MM-DD` y valor real? */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * Noches de una estancia como **número** (`[checkIn, checkOut)`).
 *
 * Devuelve `0` si las fechas no son válidas o la salida no es posterior: el llamante decide qué
 * mostrar. Coincide con `nightsBetween(...).length` del servidor.
 */
export function nightsCount(checkInDate: string, checkOutDate: string): number {
  if (!isIsoDate(checkInDate) || !isIsoDate(checkOutDate)) return 0;
  const start = Date.parse(`${checkInDate}T00:00:00Z`);
  const end = Date.parse(`${checkOutDate}T00:00:00Z`);
  if (end <= start) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** Día siguiente a `iso` (`AAAA-MM-DD`), en UTC. */
export function nextDay(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  return new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** Motivo por el que unas fechas no son reservables (o `null` si lo son). */
export type BookingDateProblem = "FECHA_INVALIDA" | "ANTERIOR_A_MANANA" | "SALIDA_NO_POSTERIOR";

/**
 * Valida la estancia con las reglas del producto:
 *   - La noche **de hoy no es vendible** (la ventana empieza en `hoy + 1`, D-4): la entrada no puede
 *     ser anterior a mañana.
 *   - La salida debe ser **posterior** a la entrada (una estancia de 0 noches no existe).
 *
 * `todayIso` se inyecta para poder probarlo sin depender del reloj de la máquina.
 */
export function validateStay(
  checkInDate: string,
  checkOutDate: string,
  todayIso: string = isoDate(0),
): BookingDateProblem | null {
  if (!isIsoDate(checkInDate) || !isIsoDate(checkOutDate) || !isIsoDate(todayIso)) return "FECHA_INVALIDA";
  if (checkInDate < nextDay(todayIso)) return "ANTERIOR_A_MANANA";
  if (checkOutDate <= checkInDate) return "SALIDA_NO_POSTERIOR";
  return null;
}

/** Parámetros de la búsqueda de disponibilidad que transporta la barra de reserva. */
export interface BookingQuery {
  checkInDate?: string;
  checkOutDate?: string;
  guests?: number;
}

/** `URLSearchParams` de la búsqueda (omite lo que no sea válido: nunca inventa fechas). */
export function bookingSearchParams(input: BookingQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (input.checkInDate && isIsoDate(input.checkInDate)) params.set("from", input.checkInDate);
  if (input.checkOutDate && isIsoDate(input.checkOutDate)) params.set("to", input.checkOutDate);
  if (typeof input.guests === "number" && Number.isInteger(input.guests) && input.guests > 0) {
    params.set("guests", String(input.guests));
  }
  return params;
}

/** Lee la búsqueda de la URL con respaldo: fechas inválidas se descartan, no se corrigen a ciegas. */
export function parseBookingQuery(search: string | URLSearchParams): BookingQuery {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const guestsRaw = params.get("guests") ?? "";
  const guests = Number.parseInt(guestsRaw, 10);

  return {
    checkInDate: isIsoDate(from) ? from : undefined,
    checkOutDate: isIsoDate(to) ? to : undefined,
    guests: Number.isInteger(guests) && guests > 0 && guests <= MAX_GUESTS ? guests : undefined,
  };
}

/** Máximo de huéspedes que ofrece la barra (un hotel de estas características no pide más). */
export const MAX_GUESTS = 6;
