import "server-only";
import {
  ActivitiesRepository,
  ContentRepository,
  ReviewsRepository,
  RoomsRepository,
  type ActivityRecord,
  type HotelImageRecord,
  type HotelOfferRecord,
  type ReviewRecord,
  type ReviewsSummary,
  type RoomRecord,
} from "@hotel/shared";
import { roomTypeKey, type HomeImage, type HomeReview, type HomeSuite } from "./home-view";

/**
 * Contenido de la home de la suite pública (F6 · D-66, D-68, D-69, D-70 · Fase C).
 *
 * Agrega en una sola lectura las secciones que dependen de datos: **portada editorial** (sección
 * `HERO` de `hotel_images`), **habitaciones publicadas** (una por tipo, con su foto de portada),
 * planes activos, galería de «experiencia», catálogo de actividades y reseñas aprobadas con su nota
 * media.
 *
 * **Degradación elegante**: cada fuente se resuelve de forma independiente (`allSettled`); si una
 * falla (BD caída, tabla vacía), su sección queda vacía y la home **sigue sirviendo** el resto. Nunca
 * tumba la página por un dato accesorio.
 */

export interface HomeContent {
  hero: HomeImage | null;
  suites: HomeSuite[];
  offers: HotelOfferRecord[];
  gallery: HotelImageRecord[];
  activities: ActivityRecord[];
  reviews: HomeReview[];
  reviewsSummary: ReviewsSummary;
}

const EMPTY: HomeContent = {
  hero: null,
  suites: [],
  offers: [],
  gallery: [],
  activities: [],
  reviews: [],
  reviewsSummary: { average: null, count: 0 },
};

/** `value` si la promesa se resolvió; `fallback` si falló. */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/** Orden de presentación de los estilos de habitación (de menor a mayor categoría). */
const SUITE_ORDER = ["simple", "doble", "suite"] as const;

/** Imagen de contenido → modelo de vista (con su texto alternativo por idioma). */
function toHomeImage(image: HotelImageRecord): HomeImage {
  return {
    fileName: image.fileName,
    altEs: image.altTextEs,
    altEn: image.altTextEn,
    altRu: image.altTextRu,
  };
}

/** Reseña de la base → modelo de vista (solo lo que la tarjeta pinta). */
function toHomeReview(review: ReviewRecord): HomeReview {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    roomType: roomTypeKey(review.roomType),
  };
}

/**
 * Una habitación **publicada por tipo** con su foto de portada.
 *
 * Se lee el maestro real (D-3) y se elige la primera publicada de cada tipo; si la lectura de
 * imágenes falla, la tarjeta se pinta **sin foto** (nunca se inventa contenido). Las lecturas están
 * acotadas a tres tipos como máximo, así que no hace falta materializar el catálogo entero.
 */
async function loadHomeSuites(repo: RoomsRepository): Promise<HomeSuite[]> {
  const rooms = (await repo.listRooms()).filter(
    (room: RoomRecord) => room.publicationStatus === "PUBLISHED",
  );

  const chosen: RoomRecord[] = [];
  for (const type of SUITE_ORDER) {
    const room = rooms.find((candidate) => roomTypeKey(candidate.roomType) === type);
    if (room) chosen.push(room);
  }

  return Promise.all(
    chosen.map(async (room): Promise<HomeSuite> => {
      const images = await repo.listImages(room.id).catch(() => []);
      const cover = images.find((image) => image.isCover) ?? images[0] ?? null;
      return {
        id: room.id,
        roomNumber: room.roomNumber,
        roomType: roomTypeKey(room.roomType),
        capacity: room.capacity,
        beds: room.beds,
        sizeM2: room.sizeM2,
        descriptionEs: room.descriptionEs,
        descriptionEn: room.descriptionEn,
        descriptionRu: room.descriptionRu,
        cover: cover === null ? null : toRoomImage(cover),
      };
    }),
  );
}

/** Imagen de habitación → modelo de vista. */
function toRoomImage(image: {
  fileName: string;
  altTextEs: string | null;
  altTextEn: string | null;
  altTextRu: string | null;
}): HomeImage {
  return {
    fileName: image.fileName,
    altEs: image.altTextEs,
    altEn: image.altTextEn,
    altRu: image.altTextRu,
  };
}

export async function getHomeContent(): Promise<HomeContent> {
  // Se instancian aquí (no a nivel de módulo) para no tocar la BD al importar el módulo.
  const contentRepo = new ContentRepository();
  const reviewsRepo = new ReviewsRepository();
  const activitiesRepo = new ActivitiesRepository();
  const roomsRepo = new RoomsRepository();

  const [offers, gallery, activities, reviews, summary, hero, suites] = await Promise.allSettled([
    contentRepo.listOffers({ activeOnly: true }),
    contentRepo.listImages("EXPERIENCE"),
    activitiesRepo.listActivities({ activeOnly: true }),
    reviewsRepo.listApproved(9),
    reviewsRepo.summary(),
    contentRepo.findCoverImage("HERO"),
    loadHomeSuites(roomsRepo),
  ]);

  const coverImage = settled(hero, null);
  // El tipo se fija a la fila de la base: el modelo de vista lo aplica `toHomeReview` después.
  const approvedReviews = settled<ReviewRecord[]>(reviews, []);

  return {
    hero: coverImage === null ? null : toHomeImage(coverImage),
    suites: settled(suites, EMPTY.suites),
    offers: settled(offers, EMPTY.offers),
    gallery: settled(gallery, EMPTY.gallery),
    activities: settled(activities, EMPTY.activities),
    reviews: approvedReviews.map(toHomeReview),
    reviewsSummary: settled(summary, EMPTY.reviewsSummary),
  };
}
