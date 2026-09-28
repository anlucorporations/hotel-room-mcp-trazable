import "server-only";
import { RoomsRepository, type RoomRecord } from "@hotel/shared";
import { buildRoomSeed } from "@hotel/shared/domain";
import { loadHomeSuites } from "./home-content";
import { roomTypeKey, type HomeReview, type HomeSuite } from "./home-view";

/**
 * Contenido de las **páginas de sección** de la suite pública (petición del responsable, 2026-09-28).
 *
 * La home pasa a ser un resumen y cada sección tiene su página; estas lecturas alimentan las dos
 * páginas que se apoyan en **datos reales del hotel** (`/habitaciones` y `/instalaciones`) sin
 * duplicar la lógica de la home: reutilizan `loadHomeSuites` y el maestro de habitaciones.
 *
 * **Degradación elegante**: si la base no responde, la distribución cae al **maestro** del código
 * (`buildRoomSeed`, la fuente de la siembra, D-3/D-14) —que es información real, no inventada— y la
 * página sigue sirviendo.
 */

/** Resumen por **tipo de habitación** para la página de habitaciones. */
export interface RoomTypeOverview {
  readonly roomType: "simple" | "doble" | "suite";
  readonly count: number;
  readonly capacityMin: number;
  readonly capacityMax: number;
  readonly sizeMin: number | null;
  readonly sizeMax: number | null;
  /** Habitación publicada representativa (con su foto), si la hay. */
  readonly sample: HomeSuite | null;
}

/** Una planta del hotel con su numeración y el reparto de tipos. */
export interface HotelFloor {
  readonly key: "ground" | "first";
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly types: ReadonlyArray<{ roomType: string; count: number }>;
}

export interface HotelDistribution {
  readonly totalRooms: number;
  readonly floors: readonly HotelFloor[];
  readonly byType: ReadonlyArray<{ roomType: string; count: number }>;
  /** `true` si la lectura cayó al maestro del código (la base no respondió). */
  readonly fromMaster: boolean;
}

interface MinimalRoom {
  readonly roomNumber: number;
  readonly roomType: string;
  readonly capacity: number;
  readonly sizeM2: number | null;
}

/** Habitaciones del maestro en el formato mínimo que necesitan los resúmenes. */
function masterRooms(): MinimalRoom[] {
  // El maestro del código declara número, planta, tipo, capacidad y camas; **no** la superficie
  // (esa vive en la ficha de la base): sin BD, los rangos de m² quedan sin dato y la página lo
  // omite en lugar de inventarlo.
  return buildRoomSeed().map((room) => ({
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    capacity: room.capacity,
    sizeM2: null,
  }));
}

/** Habitaciones de la base; si falla, el maestro del código (misma información, sin BD). */
async function loadRooms(): Promise<{ rooms: MinimalRoom[]; fromMaster: boolean }> {
  try {
    const rows: RoomRecord[] = await new RoomsRepository().listRooms();
    if (rows.length === 0) return { rooms: masterRooms(), fromMaster: true };
    return {
      rooms: rows.map((room) => ({
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        capacity: room.capacity,
        sizeM2: room.sizeM2,
      })),
      fromMaster: false,
    };
  } catch {
    return { rooms: masterRooms(), fromMaster: true };
  }
}

const TYPES = ["simple", "doble", "suite"] as const;

/** Reparto de habitaciones por tipo, en el orden del catálogo (simple → suite). */
function countByType(rooms: readonly MinimalRoom[]): Array<{ roomType: string; count: number }> {
  return TYPES.map((roomType) => ({
    roomType,
    count: rooms.filter((room) => roomTypeKey(room.roomType) === roomType).length,
  }));
}

/**
 * Distribución del hotel por plantas, derivada de la numeración real: la planta baja es 1XX y la
 * primera 2XX (así lo fija el maestro). No se declara ninguna planta «de memoria».
 */
export async function getHotelDistribution(): Promise<HotelDistribution> {
  const { rooms, fromMaster } = await loadRooms();
  const floors: HotelFloor[] = [
    { key: "ground", from: 100, to: 199 },
    { key: "first", from: 200, to: 299 },
  ]
    .map((floor) => {
      const inFloor = rooms.filter(
        (room) => room.roomNumber >= floor.from && room.roomNumber <= floor.to,
      );
      const numbers = inFloor.map((room) => room.roomNumber).sort((a, b) => a - b);
      return {
        key: floor.key as HotelFloor["key"],
        from: numbers[0] ?? floor.from,
        to: numbers[numbers.length - 1] ?? floor.to,
        count: inFloor.length,
        types: countByType(inFloor).filter((entry) => entry.count > 0),
      };
    })
    .filter((floor) => floor.count > 0);

  return { totalRooms: rooms.length, floors, byType: countByType(rooms), fromMaster };
}

/** Resumen por tipo: cuántas hay, rango de capacidad y de superficie, y una ficha de muestra. */
export async function getRoomTypeOverview(): Promise<RoomTypeOverview[]> {
  const [{ rooms }, samples] = await Promise.all([loadRooms(), loadHomeSuites(new RoomsRepository()).catch(() => [])]);

  return TYPES.map((roomType) => {
    const ofType = rooms.filter((room) => roomTypeKey(room.roomType) === roomType);
    const sizes = ofType
      .map((room) => room.sizeM2)
      .filter((size): size is number => typeof size === "number");
    const capacities = ofType.map((room) => room.capacity);
    return {
      roomType,
      count: ofType.length,
      capacityMin: capacities.length > 0 ? Math.min(...capacities) : 1,
      capacityMax: capacities.length > 0 ? Math.max(...capacities) : 1,
      sizeMin: sizes.length > 0 ? Math.min(...sizes) : null,
      sizeMax: sizes.length > 0 ? Math.max(...sizes) : null,
      sample: samples.find((suite) => suite.roomType === roomType) ?? null,
    };
  }).filter((overview) => overview.count > 0);
}

/** Reseñas aprobadas para la página de reseñas (con su resumen). */
export interface PublicReviews {
  readonly reviews: readonly HomeReview[];
  readonly summary: { average: number | null; count: number };
}

/**
 * Todas las reseñas **aprobadas** (la moderación es previa, D-58) con su nota media.
 *
 * La home enseña tres como resumen; la página de reseñas necesita el listado completo para que el
 * visitante pueda leer de verdad lo que dicen los huéspedes. Si la base falla, devuelve el listado
 * vacío y la página declara su estado en lugar de inventar opiniones.
 */
export async function getPublicReviews(limit = 60): Promise<PublicReviews> {
  const { ReviewsRepository } = await import("@hotel/shared");
  const repo = new ReviewsRepository();
  const [reviews, summary] = await Promise.allSettled([repo.listApproved(limit), repo.summary()]);
  const rows = reviews.status === "fulfilled" ? reviews.value : [];
  return {
    reviews: rows.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      roomType: roomTypeKey(review.roomType),
    })),
    summary:
      summary.status === "fulfilled"
        ? { average: summary.value.average, count: summary.value.count }
        : { average: null, count: 0 },
  };
}
