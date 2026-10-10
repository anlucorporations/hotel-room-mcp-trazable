import { formatIsoDate, mondayBasedWeekday } from "./room-calendar";

/**
 * Lógica **pura** del tablero de disponibilidad del hotel (2026-10-04, `CalendarioHabitaciones`).
 *
 * Por qué vive aparte del componente: los rangos de vista (día, semana, mes, trimestre) y la
 * agregación de estados por día son aritmética de fechas UTC y de conjuntos, no presentación.
 * Aislarlas aquí permite probarlas sin navegador —y sin depender de la zona horaria de quien ejecuta
 * la suite—, que es lo que exige un mapa reutilizable desde administración, recepción, housekeeping o
 * mantenimiento.
 *
 * Reglas fijadas con el responsable:
 *   · Los tres estados son **independientes**: una habitación publicada y reservada el mismo día suma
 *     a los dos contadores (igual que la clase «AMBAS» del calendario por habitación).
 *   · `occupied` = noche con token no disponible o reserva ya `COMPLETED` (estancia pasada).
 *   · `maintenance` es un estado **actual** (publicación en mantenimiento o incidencia abierta que
 *     bloquea la venta): no tiene día programado, así que se pinta en todos los días de la vista.
 *
 * La semana empieza en **lunes** y todo se calcula en **UTC**, la misma zona con la que el servidor
 * clasifica los días (`listRoomDayStates`), para que no haya saltos de día.
 */

/** Rango de vista del tablero. */
export type BoardView = "DAY" | "WEEK" | "MONTH" | "QUARTER";

/** Ventana de fechas `[from, to]`, con los dos extremos **inclusive**. */
export interface BoardRange {
  readonly from: string;
  readonly to: string;
}

/** Estado de una habitación en un día, tal y como lo entrega la API. */
export interface RoomDayState {
  readonly roomId: string;
  readonly date: string;
  readonly published: boolean;
  readonly reserved: boolean;
  readonly occupied: boolean;
}

/** Totales de un día del tablero. */
export interface BoardDayTotals {
  readonly date: string;
  readonly published: number;
  readonly reserved: number;
  readonly occupied: number;
  readonly maintenance: number;
  /**
   * Habitaciones **distintas** con algún estado ese día. No es la suma de los contadores: una misma
   * habitación puede estar publicada y reservada a la vez.
   */
  readonly withActivity: number;
}

/** Tope de días que se pintan de una vez (un trimestre son 92; deja margen sin permitir abusos). */
export const BOARD_MAX_DAYS = 400;

const MS_PER_DAY = 86_400_000;

/** Partes numéricas de una fecha ISO `YYYY-MM-DD` (0 si el texto viene incompleto). */
export function isoParts(iso: string): { year: number; month: number; day: number } {
  const [year = 0, month = 0, day = 0] = iso.split("-").map(Number);
  return { year, month, day };
}

/** Suma (o resta, con `delta` negativo) días a una fecha ISO `YYYY-MM-DD`, en UTC. */
export function addDays(iso: string, delta: number): string {
  const { year, month, day } = isoParts(iso);
  const date = new Date(Date.UTC(year, month - 1, day) + delta * MS_PER_DAY);
  return formatIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Primer día del mes de `iso`. */
export function startOfMonth(iso: string): string {
  const { year, month } = isoParts(iso);
  return formatIsoDate(year, month, 1);
}

/** Lunes de la semana de `iso`. */
export function startOfWeek(iso: string): string {
  const { year, month, day } = isoParts(iso);
  return addDays(iso, -mondayBasedWeekday(year, month, day));
}

/** Primer día del trimestre de `iso` (enero, abril, julio u octubre). */
export function startOfQuarter(iso: string): string {
  const { year, month } = isoParts(iso);
  return formatIsoDate(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
}

/** Ventana que cubre la vista alrededor de `anchor`. */
export function rangeForView(view: BoardView, anchor: string): BoardRange {
  switch (view) {
    case "DAY":
      return { from: anchor, to: anchor };
    case "WEEK": {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    case "MONTH": {
      const from = startOfMonth(anchor);
      // El día 1 + 32 cae siempre en el mes siguiente; su día 1 menos uno es el último del mes.
      return { from, to: addDays(startOfMonth(addDays(from, 32)), -1) };
    }
    case "QUARTER": {
      const from = startOfQuarter(anchor);
      // El día 1 + 95 cae siempre en el trimestre siguiente (92 días como máximo).
      return { from, to: addDays(startOfMonth(addDays(from, 95)), -1) };
    }
  }
}

/** Fechas ISO del rango, de `from` a `to`, con tope de seguridad. */
export function enumerateDates(range: BoardRange, cap: number = BOARD_MAX_DAYS): string[] {
  const dates: string[] = [];
  let cursor = range.from;
  while (cursor <= range.to && dates.length < cap) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Agrega los estados en los totales por día de la vista.
 *
 * `maintenanceRoomIds` son habitaciones **en mantenimiento ahora**: se cuentan en todos los días del
 * rango (limitación conocida y documentada: las incidencias no tienen día programado).
 */
export function aggregateBoardDays(
  states: readonly RoomDayState[],
  maintenanceRoomIds: readonly string[],
  range: BoardRange,
): BoardDayTotals[] {
  const published = new Map<string, Set<string>>();
  const reserved = new Map<string, Set<string>>();
  const occupied = new Map<string, Set<string>>();

  const add = (map: Map<string, Set<string>>, date: string, roomId: string): void => {
    const bucket = map.get(date);
    if (bucket) bucket.add(roomId);
    else map.set(date, new Set([roomId]));
  };

  for (const state of states) {
    if (state.date < range.from || state.date > range.to) continue;
    if (state.published) add(published, state.date, state.roomId);
    if (state.reserved) add(reserved, state.date, state.roomId);
    if (state.occupied) add(occupied, state.date, state.roomId);
  }

  return enumerateDates(range).map((date) => {
    const publishedSet = published.get(date);
    const reservedSet = reserved.get(date);
    const occupiedSet = occupied.get(date);
    const maintenance = new Set(maintenanceRoomIds);
    const withActivity = new Set<string>([
      ...(publishedSet ?? []),
      ...(reservedSet ?? []),
      ...(occupiedSet ?? []),
      ...maintenance,
    ]);
    return {
      date,
      published: publishedSet?.size ?? 0,
      reserved: reservedSet?.size ?? 0,
      occupied: occupiedSet?.size ?? 0,
      maintenance: maintenance.size,
      withActivity: withActivity.size,
    };
  });
}

/** Acciones que se pueden ejecutar sobre las habitaciones de un día seleccionado. */
export type BoardDayAction = "PUBLISH" | "RESERVE" | "RELEASE" | "MINT" | "SERVICE";

/** Lo mínimo que necesita la elegibilidad de una habitación en un día. */
export interface DayRoomFlags {
  readonly published: boolean;
  readonly reserved: boolean;
  readonly occupied: boolean;
  readonly maintenance: boolean;
  readonly publicationStatus: string;
}

/**
 * ¿Esta habitación admite esta acción **ese día**? (2026-10-04, panel del día.)
 *
 *   · `PUBLISH`: la noche está libre (ni reservada ni ocupada), no está en mantenimiento y la ficha
 *     no está ya publicada — publicar de nuevo no aporta nada.
 *   · `RESERVE`: la noche está libre y la habitación no está en mantenimiento.
 *   · `RELEASE`: hay una reserva viva esa noche (es lo único que se puede liberar).
 *   · `MINT`: la noche está libre (el minteo on-chain vuelve a validar contra la cadena).
 *   · `SERVICE`: cualquier habitación puede necesitar mantenimiento o lencería.
 *
 * La API revérifica por su cuenta: estas reglas son de interfaz, no la autoridad final.
 */
export function isDayRoomEligible(room: DayRoomFlags, action: BoardDayAction): boolean {
  switch (action) {
    case "PUBLISH":
      return !room.published && room.publicationStatus !== "PUBLISHED" && !room.reserved && !room.occupied && !room.maintenance;
    case "RESERVE":
      return !room.reserved && !room.occupied && !room.maintenance;
    case "RELEASE":
      return room.reserved;
    case "MINT":
      return !room.reserved && !room.occupied;
    case "SERVICE":
      return true;
  }
}

/**
 * Códigos de tipo de habitación que conoce el panel del día (`room_type` de la base, en mayúsculas).
 * Son los mismos que traduce el namespace `rooms.types.*`; cualquier otro código se muestra tal cual
 * en lugar de romper la fila.
 */
export const BOARD_ROOM_TYPES = ["SIMPLE", "DOBLE", "SUITE"] as const;

export type BoardRoomTypeCode = (typeof BOARD_ROOM_TYPES)[number];

/**
 * Clave i18n del tipo de habitación en el namespace **`roomType`** (`simple`/`doble`/`suite`), o
 * `null` si el código no es de los conocidos.
 *
 * El código llega en mayúsculas (es el `room_type` de la base, `SIMPLE`/`DOBLE`/`SUITE`) y la
 * traducción vive en el namespace anidado `roomType` que ya usa el catálogo público —no en las claves
 * planas `rooms["types.SIMPLE"]`, que next-intl no resuelve porque interpreta el punto como ruta.
 *
 * Vive aquí, y no en el componente, porque es la única traducción código→etiqueta del tablero: el
 * operador elige la habitación **por número y tipo** (petición del responsable, 2026-10-10), y ese
 * mapa tiene que poder probarse sin navegador.
 */
export function roomTypeLabelKey(code: string): string | null {
  return (BOARD_ROOM_TYPES as readonly string[]).includes(code) ? code.toLowerCase() : null;
}

/** Lo mínimo para agrupar habitaciones por planta: la planta y el número (para ordenar). */
export interface FloorGroupableRoom {
  readonly floor: number | null;
  readonly roomNumber: number;
}

/** Ficha de planta del panel del día: la planta y sus habitaciones ya ordenadas. */
export interface FloorGroup<T> {
  /** Número de planta; `null` para las habitaciones sin planta asignada. */
  readonly floor: number | null;
  readonly rooms: readonly T[];
}

/**
 * Agrupa las habitaciones **por planta** para la vista en fichas del panel del día (2026-10-10).
 *
 * Reglas: las plantas se ordenan de menor a mayor y las habitaciones por número dentro de cada una;
 * las que no tienen planta van a un grupo propio **al final** (nunca se mezclan con la planta 0 ni se
 * pierden). Es aritmética de agrupación, no presentación, así que vive aquí y se prueba sin navegador.
 */
export function groupRoomsByFloor<T extends FloorGroupableRoom>(
  rooms: readonly T[],
): readonly FloorGroup<T>[] {
  const groups = new Map<number | null, T[]>();
  for (const room of rooms) {
    const key = room.floor ?? null;
    const bucket = groups.get(key);
    if (bucket) bucket.push(room);
    else groups.set(key, [room]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([floor, list]) => ({
      floor,
      rooms: [...list].sort((x, y) => x.roomNumber - y.roomNumber),
    }));
}
