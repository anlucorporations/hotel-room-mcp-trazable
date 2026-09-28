/**
 * Modelo de vista de la home de la suite pública (propuesta de imagen visual · Fase C).
 *
 * Los componentes de la home son **presentacionales**: reciben estos tipos ya resueltos desde
 * `getHomeContent()` (servidor) y no tocan la base de datos ni importan el barril de `@hotel/shared`.
 * Así la frontera cliente/servidor del guardián `boundaries.test.ts` sigue intacta y las tarjetas se
 * pueden reutilizar en cualquier página.
 */

/** Imagen editorial con su texto alternativo por idioma (D-6: respaldo al español). */
export interface HomeImage {
  fileName: string;
  altEs: string | null;
  altEn: string | null;
  altRu: string | null;
}

/** Habitación publicada lista para pintar en la tarjeta horizontal de la home. */
export interface HomeSuite {
  id: string;
  roomNumber: number;
  /** Tipo en minúsculas, la forma que usan el dominio y los catálogos i18n (`roomType.*`). */
  roomType: "simple" | "doble" | "suite";
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  cover: HomeImage | null;
}

/**
 * Reseña **aprobada** lista para pintar (D-58: la moderación es previa).
 *
 * Es un modelo de vista, no la fila de la base: la tarjeta del testimonio no necesita `tokenId`,
 * `roomId` ni la traza de moderación, y así no arrastra el barril de `@hotel/shared` al componente.
 */
export interface HomeReview {
  id: string;
  rating: number;
  comment: string | null;
  roomType: "simple" | "doble" | "suite";
}

/** Texto localizado con respaldo al español (D-6). */
export function pick(
  locale: string,
  es: string | null,
  en: string | null,
  ru: string | null,
): string {
  if (locale.startsWith("en")) return en ?? es ?? "";
  if (locale.startsWith("ru")) return ru ?? es ?? "";
  return es ?? "";
}

/** `SUITE` → `suite` (clave de los catálogos i18n `roomType.*`). */
export function roomTypeKey(code: string): "simple" | "doble" | "suite" {
  if (code === "DOBLE") return "doble";
  if (code === "SUITE") return "suite";
  return "simple";
}
