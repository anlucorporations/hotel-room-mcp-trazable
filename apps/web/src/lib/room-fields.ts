import type { RoomTypeDb } from "@hotel/shared/domain";

/**
 * Opciones **de la ficha de habitación** compartidas por el servidor y la interfaz (2026-10-02).
 *
 * Por qué un módulo aparte: `lib/rooms.ts` importa `server-only` (valida cuerpos de API y calcula
 * huellas con `viem`), así que un componente de cliente **no puede** importar sus constantes — y de
 * hecho `RoomsAdmin` las tenía duplicadas a mano. Aquí viven las listas cerradas (los mismos valores
 * que imponen los `CHECK` de PostgreSQL), sin dependencias de servidor, para que la validación y el
 * formulario tengan **una sola fuente**.
 *
 * Frontera cliente/servidor (2026-10-02): este módulo lo importan componentes de cliente, así que
 * **no puede** usar el barril `@hotel/shared` (arrastra `pg`/`bullmq` al bundle; lo vigila
 * `boundaries.test.ts`). Los tipos vienen del entry isomorfo `@hotel/shared/domain` y las dos listas
 * de estados se declaran aquí con `as const` — el valor es idéntico al de la base de datos y el tipo
 * se deriva de la propia lista, de modo que no se duplica a mano.
 */

export const ROOM_TYPES: readonly RoomTypeDb[] = ["SIMPLE", "DOBLE", "SUITE"];

/** Tipo de habitación (vocabulario de la BD) sin tener que importar el barril de servidor. */
export type RoomTypeCode = (typeof ROOM_TYPES)[number];

export const PUBLICATION_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "PAUSED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;

/** Estado de publicación de la ficha (mismos valores que el `CHECK` de `rooms`). */
export type RoomPublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const OPERATIONAL_STATUSES = ["CLEAN", "DIRTY", "OCCUPIED"] as const;

/** Estado operativo de la ficha (lo mueven housekeeping y recepción). */
export type RoomOperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

/** Vistas exteriores (ficha ampliada). */
export type RoomViewKind = "SEA" | "GARDEN" | "INTERIOR";
export const ROOM_VIEWS: readonly RoomViewKind[] = ["SEA", "GARDEN", "INTERIOR"];

/** Estilos decorativos (ficha ampliada). */
export type RoomDecorStyle = "MEDITERRANEAN" | "CONTEMPORARY" | "CLASSIC" | "RUSTIC" | "MINIMAL";
export const DECOR_STYLES: readonly RoomDecorStyle[] = [
  "MEDITERRANEAN",
  "CONTEMPORARY",
  "CLASSIC",
  "RUSTIC",
  "MINIMAL",
];

/** Perfil del usuario que mira una ficha: decide qué secciones se pintan. */
export type RoomViewerProfile = "OWNER" | "RECEPTION" | "HOUSEKEEPING" | "MAINTENANCE" | "GUEST";

/**
 * Secciones de la ficha y qué perfil las ve (decisión del responsable, 2026-10-02).
 *
 * - `fisica`: físicas de la habitación (tipo, capacidad, camas, m², vistas, balcón, accesibilidad).
 * - `decorativa`: estilo, paleta, materiales y notas de decoración.
 * - `servicios`: catálogo de servicios asignados.
 * - `espacios`: espacios con su superficie.
 * - `publicaciones`: calendario de días publicados y reservados.
 * - `comercial`: tarifa y estado de publicación (información de negocio).
 */
export type RoomSectionKey =
  | "fisica"
  | "decorativa"
  | "servicios"
  | "espacios"
  | "publicaciones"
  | "comercial";

export const ROOM_SECTIONS_BY_PROFILE: Readonly<Record<RoomViewerProfile, readonly RoomSectionKey[]>> = {
  // El owner lo ve todo.
  OWNER: ["fisica", "decorativa", "servicios", "espacios", "publicaciones", "comercial"],
  // Recepción necesita saber qué hay y cuándo está ocupada; el negocio no es suyo.
  RECEPTION: ["fisica", "servicios", "espacios", "publicaciones"],
  // Limpieza y mantenimiento necesitan la decoración y los servicios, no el calendario comercial.
  HOUSEKEEPING: ["fisica", "decorativa", "servicios", "espacios"],
  MAINTENANCE: ["fisica", "decorativa", "servicios", "espacios"],
  // El huésped ve la ficha "bonita" y la disponibilidad publicada, sin datos de negocio.
  GUEST: ["fisica", "decorativa", "servicios", "espacios", "publicaciones"],
};

/** ¿Este perfil ve esta sección de la ficha? */
export function profileSeesSection(profile: RoomViewerProfile, section: RoomSectionKey): boolean {
  return ROOM_SECTIONS_BY_PROFILE[profile].includes(section);
}

/** Máximo de fotos por habitación en el formulario (la BD admite 5; la UI pide 4). */
export const ROOM_PHOTO_LIMIT = 4;

/**
 * Peso máximo de una foto **ya reducida** antes de subirla (2 MB).
 *
 * Espejo del límite que impone la API (`ROOM_IMAGE_MAX_BYTES` en `lib/room-images.ts`): aquel módulo
 * importa `node:path` y no se puede usar desde el navegador, así que el formulario necesita el suyo
 * para avisar (`roomPhotoTooBig`) antes de gastar la subida. Si el servidor cambia de límite, este
 * número debe cambiar con él.
 */
export const ROOM_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Lado mayor al que se reescala una foto antes de subirla («calidad media»). */
export const ROOM_PHOTO_MAX_EDGE_PX = 1600;

/** Calidad JPEG del reescalado en el navegador (0–1). */
export const ROOM_PHOTO_JPEG_QUALITY = 0.75;
