import "server-only";
import {
  ActivitiesRepository,
  ContentRepository,
  ReviewsRepository,
  type ActivityRecord,
  type HotelImageRecord,
  type HotelOfferRecord,
  type ReviewRecord,
  type ReviewsSummary,
} from "@hotel/shared";

/**
 * Contenido de la home de la suite pública (F6 · D-66, D-68, D-69, D-70).
 *
 * Agrega en una sola lectura las secciones que dependen de datos: planes activos, galería de
 * «experiencia», catálogo de actividades y reseñas aprobadas con su nota media.
 *
 * **Degradación elegante**: cada fuente se resuelve de forma independiente (`allSettled`); si una
 * falla (BD caída, tabla vacía), su sección queda vacía y la home **sigue sirviendo** el resto. Nunca
 * tumba la página por un dato accesorio.
 */

export interface HomeContent {
  offers: HotelOfferRecord[];
  gallery: HotelImageRecord[];
  activities: ActivityRecord[];
  reviews: ReviewRecord[];
  reviewsSummary: ReviewsSummary;
}

const EMPTY: HomeContent = {
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

export async function getHomeContent(): Promise<HomeContent> {
  // Se instancian aquí (no a nivel de módulo) para no tocar la BD al importar el módulo.
  const contentRepo = new ContentRepository();
  const reviewsRepo = new ReviewsRepository();
  const activitiesRepo = new ActivitiesRepository();

  const [offers, gallery, activities, reviews, summary] = await Promise.allSettled([
    contentRepo.listOffers({ activeOnly: true }),
    contentRepo.listImages("EXPERIENCE"),
    activitiesRepo.listActivities({ activeOnly: true }),
    reviewsRepo.listApproved(9),
    reviewsRepo.summary(),
  ]);

  return {
    offers: settled(offers, EMPTY.offers),
    gallery: settled(gallery, EMPTY.gallery),
    activities: settled(activities, EMPTY.activities),
    reviews: settled(reviews, EMPTY.reviews),
    reviewsSummary: settled(summary, EMPTY.reviewsSummary),
  };
}
