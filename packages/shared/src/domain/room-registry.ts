import { ALL_ROOMS, roomTypeOf, type RoomTypeDb } from "./room-master";
import type { NightType } from "./types";

/**
 * Corte de contrato F8 (D-3, D-10, D-13, D-14): puente entre el **maestro de habitaciones** y el
 * **registro dinámico on-chain**.
 *
 * El maestro (`ALL_ROOMS`) es la **semilla de carga** (D-14): su contenido se vuelca en la tabla
 * `rooms` (fuente única, D-3) y, desde ahí, se registra cada habitación en el contrato con
 * `registerRoom(room, roomType)`. El contrato arranca **vacío** (D-13) y solo acepta `mint` de
 * habitaciones registradas, así que este plan es obligatorio antes de mintear.
 *
 * Es lógica **pura** (sin E/S ni `node:*`) para poder probarla y para que la web, los scripts de
 * siembra y los E2E compartan exactamente el mismo reparto habitación→tipo.
 */

/** Reparto de tipo por habitación según el maestro (rango 101–115 simple, 116–130 doble, 201–220 suite). */
const CAPACITY_BY_TYPE: Readonly<Record<NightType, number>> = {
  simple: 1,
  doble: 2,
  suite: 2,
};

const BEDS_BY_TYPE: Readonly<Record<NightType, number>> = {
  simple: 1,
  doble: 2,
  suite: 2,
};

/**
 * Tarifa base **provisional** por tipo, en wei (mismo orden de magnitud que la inyección de datos).
 * El hotel la ajusta desde la ficha; queda documentada como valor de arranque, no como tarifa real.
 */
const BASE_RATE_WEI_BY_TYPE: Readonly<Record<NightType, string>> = {
  simple: "50000000000000000", // 0.05 ETH
  doble: "90000000000000000", // 0.09 ETH
  suite: "250000000000000000", // 0.25 ETH
};

/** Texto de arranque por tipo; el hotel lo sustituye antes de publicar (D-6 exige ES). */
const DESCRIPTION_ES_BY_TYPE: Readonly<Record<NightType, string>> = {
  simple: "Habitación individual con lo necesario para una estancia cómoda.",
  doble: "Habitación doble, ideal para parejas o dos personas.",
  suite: "Suite amplia con las mejores vistas y servicios del hotel.",
};

const DESCRIPTION_EN_BY_TYPE: Readonly<Record<NightType, string>> = {
  simple: "Single room with everything needed for a comfortable stay.",
  doble: "Double room, ideal for couples or two guests.",
  suite: "Spacious suite with the hotel's best views and services.",
};

const DESCRIPTION_RU_BY_TYPE: Readonly<Record<NightType, string>> = {
  simple: "Одноместный номер со всем необходимым для комфортного проживания.",
  doble: "Двухместный номер, идеален для пар или двух гостей.",
  suite: "Просторный люкс с лучшими видами и услугами отеля.",
};

/** Fila lista para `INSERT INTO rooms` (antes de que el hotel edite la ficha). */
export interface RoomSeedEntry {
  roomNumber: number;
  /** 0 = planta baja (101–130), 1 = primera planta (201–220). */
  floor: number;
  roomType: RoomTypeDb;
  capacity: number;
  beds: number;
  baseRateWei: string;
  descriptionEs: string;
  descriptionEn: string;
  descriptionRu: string;
}

/** Una habitación a registrar on-chain, con el vocabulario que espera `registerRoom`. */
export interface OnChainRoomRegistration {
  room: number;
  roomType: NightType;
}

const floorOf = (room: number): number => (room >= 200 ? 1 : 0);

/**
 * Construye el volcado del maestro a la tabla `rooms`. Determinista y ordenado; lanza si alguna
 * habitación del maestro no tiene tipo (sería un maestro incoherente).
 */
export function buildRoomSeed(rooms: readonly number[] = ALL_ROOMS): RoomSeedEntry[] {
  return rooms.map((room) => {
    const type = roomTypeOf(room);
    if (type === null) {
      throw new Error(`la habitación ${room} no está en el maestro de habitaciones`);
    }
    return {
      roomNumber: room,
      floor: floorOf(room),
      roomType: type.toUpperCase() as RoomTypeDb,
      capacity: CAPACITY_BY_TYPE[type],
      beds: BEDS_BY_TYPE[type],
      baseRateWei: BASE_RATE_WEI_BY_TYPE[type],
      descriptionEs: DESCRIPTION_ES_BY_TYPE[type],
      descriptionEn: DESCRIPTION_EN_BY_TYPE[type],
      descriptionRu: DESCRIPTION_RU_BY_TYPE[type],
    };
  });
}

/**
 * Traduce las filas de `rooms` al plan de registro on-chain. Acepta el vocabulario de la BD en
 * cualquier caja (`SIMPLE`/`simple`) y **descarta** filas con tipo desconocido para no registrar una
 * habitación con un tipo que el contrato rechazaría (`_checkRoomType`).
 */
export function buildRoomRegistrationPlan(
  rows: readonly { roomNumber: number; roomType: string }[],
): OnChainRoomRegistration[] {
  const plan: OnChainRoomRegistration[] = [];
  for (const row of rows) {
    const normalized = row.roomType.trim().toLowerCase();
    if (normalized !== "simple" && normalized !== "doble" && normalized !== "suite") continue;
    plan.push({ room: row.roomNumber, roomType: normalized });
  }
  return plan.sort((a, b) => a.room - b.room);
}
