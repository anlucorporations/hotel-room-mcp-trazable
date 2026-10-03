import type {
  RoomDecorStyle,
  RoomOperationalStatus,
  RoomPublicationStatus,
  RoomTypeCode,
  RoomViewKind,
} from "@/lib/room-fields";

/**
 * Contrato **de cliente** de la ficha de habitación (2026-10-02).
 *
 * Por qué este módulo: la API (`GET /api/admin/rooms` y `GET /api/admin/rooms/[id]`) devuelve JSON, y
 * en JSON las fechas son **cadenas ISO**, no `Date` como en el tipo de servidor `RoomRecord`. El
 * formulario flotante (`RoomFormDialog`) y la tabla (`RoomsAdmin`) comparten estas formas, y las
 * declaran en un solo sitio para que la precarga de la edición y el resumen no diverjan.
 *
 * Frontera cliente/servidor: aquí **no** se importa `@hotel/shared` (barril de servidor; lo prohíbe
 * `boundaries.test.ts` en módulos de cliente). Los tipos de vocabulario cerrado vienen de
 * `@/lib/room-fields`, que es la fuente isomorfa de las listas.
 */

/** Habitación tal y como la entrega la API de administración. */
export interface AdminRoom {
  id: string;
  roomNumber: number;
  floor: number | null;
  roomType: RoomTypeCode;
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  /** Tarifa base en wei (cadena decimal); `null` si no se fijó. */
  baseRateWei: string | null;
  // — Ficha ampliada (2026-10-02) —
  viewKind: RoomViewKind | null;
  hasBalcony: boolean;
  isAccessible: boolean;
  decorStyle: RoomDecorStyle | null;
  decorPalette: string | null;
  decorMaterials: string | null;
  decorNotesEs: string | null;
  decorNotesEn: string | null;
  decorNotesRu: string | null;
  publicationStatus: RoomPublicationStatus;
  operationalStatus: RoomOperationalStatus;
  /** ISO; `null` = vigente (archivada nunca se borra, D-8). */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Foto de la galería con su URL servida por la API. */
export interface AdminRoomImage {
  id: string;
  fileName: string;
  position: number;
  isCover: boolean;
  url: string;
}

/** Publicación de la ficha (ventana en la que estuvo publicada). */
export interface AdminRoomPublication {
  publishedAt: string;
  unpublishedAt: string | null;
}

/** Espacio asignado con su superficie (la tarifa de espacios es la del catálogo). */
export interface AdminRoomSpace {
  spaceCode: string;
  sizeM2: number | null;
}

/** Entrada del catálogo (`/api/admin/rooms/options`) con su nombre trilingüe. */
export interface AdminCatalogEntry {
  code: string;
  nameEs: string;
  nameEn: string;
  nameRu: string;
}

/** Tipo de habitación del catálogo; añade la capacidad base y el royalty (inmutable on-chain). */
export interface AdminRoomTypeOption extends AdminCatalogEntry {
  baseCapacity: number;
  royaltyBps: number;
}

/** Catálogos que alimentan el formulario y la traducción de códigos de la tabla. */
export interface AdminRoomOptions {
  roomTypes: readonly AdminRoomTypeOption[];
  amenities: readonly AdminCatalogEntry[];
  spaceTypes: readonly AdminCatalogEntry[];
}

/** Respuesta completa de `GET /api/admin/rooms/[id]`. */
export interface AdminRoomDetail {
  room: AdminRoom;
  images: readonly AdminRoomImage[];
  publications: readonly AdminRoomPublication[];
  amenities: readonly string[];
  spaces: readonly AdminRoomSpace[];
  /** Noches ocupadas de la ventana, en `YYYY-MM-DD`. */
  reservedNights: readonly string[];
  window: { from: string; to: string } | null;
}

/**
 * Nombre del catálogo en el idioma activo, con respaldo al español y al propio código.
 *
 * Es la misma regla que aplica la ficha (`catalogName` en `components/rooms/RoomDetailCard.tsx`); se
 * repite aquí —seis líneas puras— para que el formulario y la tabla no dependan de los internos de la
 * ficha, cuyo contrato público es su componente y sus props.
 */
export function catalogEntryName(
  entries: readonly AdminCatalogEntry[],
  code: string,
  locale: string,
): string {
  const entry = entries.find((item) => item.code === code);
  if (!entry) return code;
  if (locale === "en") return entry.nameEn || entry.nameEs;
  if (locale === "ru") return entry.nameRu || entry.nameEs;
  return entry.nameEs;
}
