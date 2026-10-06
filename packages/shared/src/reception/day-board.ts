import { roomTypeOf } from "../domain/room-master";
import type { NightType } from "../domain/types";

/**
 * Panel del día de recepción (RF-31/RF-32, CU-31).
 *
 * Deriva, a partir del índice `nfts` en PostgreSQL (D-31), el estado de cada una de las 50
 * habitaciones del maestro para una fecha. Es una función **pura** para poder probarla sin base de
 * datos y para que la API y la UI usen exactamente el mismo criterio.
 */

/** Estado operativo de una habitación para la fecha consultada. */
export type RoomBoardStatus =
  | "LIBRE"
  | "PENDIENTE"
  | "RESERVADA"
  | "OCUPADA"
  | "SALIDA"
  | "PENDIENTE_LIMPIEZA"
  | "BLOQUEADA";

/** Fila mínima del índice que necesita el derivador. */
export interface BoardNight {
  readonly roomNumber: number;
  readonly status: string;
}

export interface RoomBoardCell {
  readonly roomNumber: number;
  readonly roomType: NightType | null;
  readonly status: RoomBoardStatus;
}

/**
 * Traduce el estado del índice (`nfts`) al estado del panel.
 * El estado operativo real de la habitación (`rooms.operational_status`) puede sobreescribir
 * SALIDA por PENDIENTE_LIMPIEZA cuando el checkout dejó la habitación indispuesta (RF-50).
 * Un estado desconocido es LIBRE.
 */
export function roomBoardStatus(status: string): RoomBoardStatus {
  switch (status) {
    case "CONFIRMING":
      return "PENDIENTE";
    case "SOLD":
      return "RESERVADA";
    case "CHECKED_IN":
      return "OCUPADA";
    case "CHECKED_OUT":
      return "SALIDA";
    case "PENDING_CLEANING":
      return "PENDIENTE_LIMPIEZA";
    case "BURNED":
      return "BLOQUEADA";
    // AVAILABLE (inventario sin vender) y cualquier valor no esperado: habitación libre.
    default:
      return "LIBRE";
  }
}

/**
 * Construye el tablero de las `rooms` indicadas. Una habitación sin noche asociada ese día está
 * LIBRE. Si hubiera más de una fila para la misma habitación (no debería: el token codifica
 * habitación+fecha), gana el estado de mayor severidad operativa.
 *
 * El `operationalStatus` por habitación permite reflejar estados que no dependen de la noche del
 * índice, como `PENDING_CLEANING` tras un check-out (RF-50). Tiene prioridad sobre el estado de la
 * noche cuando su severidad es mayor.
 */
export function buildRoomBoard(
  rooms: readonly number[],
  nights: readonly BoardNight[],
  operationalStatus?: ReadonlyMap<number, string>,
): RoomBoardCell[] {
  const byRoom = new Map<number, string>();
  for (const night of nights) {
    const previous = byRoom.get(night.roomNumber);
    byRoom.set(night.roomNumber, previous === undefined ? night.status : mostSevere(previous, night.status));
  }

  return rooms.map((roomNumber) => {
    const nightStatus = byRoom.get(roomNumber) ?? "AVAILABLE";
    const opStatus = operationalStatus?.get(roomNumber);
    const status = opStatus
      ? mostSevere(nightStatus, opStatus)
      : nightStatus;
    return {
      roomNumber,
      roomType: roomTypeOf(roomNumber),
      status: roomBoardStatus(status),
    };
  });
}

const SEVERITY: readonly RoomBoardStatus[] = [
  "LIBRE",
  "PENDIENTE",
  "RESERVADA",
  "OCUPADA",
  "SALIDA",
  "PENDIENTE_LIMPIEZA",
  "BLOQUEADA",
];

function mostSevere(a: string, b: string): string {
  return SEVERITY.indexOf(roomBoardStatus(b)) > SEVERITY.indexOf(roomBoardStatus(a)) ? b : a;
}

/** Estado de la ficha detalle de una habitación (RF-51). Decide la Zona Habitación. */
export type RoomDetailState =
  | "LIBRE"
  | "RESERVADA"
  | "OCUPADA"
  | "MANTENIMIENTO"
  | "PENDIENTE_LIMPIEZA";

export interface RoomDetailStateInput {
  /** ¿Hay una incidencia de mantenimiento abierta en la habitación? (RF-53) */
  readonly hasOpenMaintenance: boolean;
  /** `rooms.operational_status` (CLEAN | DIRTY | OCCUPIED | PENDING_CLEANING). */
  readonly operationalStatus?: string | null;
  /** `nfts.status` de la noche de HOY de esa habitación, si existe. */
  readonly nightStatus?: string | null;
  /** ¿Existe una reserva activa con llegada futura? */
  readonly hasUpcomingReservation?: boolean;
}

/**
 * Deriva el estado de la ficha detalle con una prioridad explícita (RF-51):
 *
 *   1. **MANTENIMIENTO** — hay una incidencia abierta.
 *   2. **OCUPADA**       — la noche de hoy está `CHECKED_IN` o el estado operativo es `OCCUPIED`.
 *   3. **PENDIENTE_LIMPIEZA** — el check-out la dejó indispuesta (RF-50).
 *   4. **RESERVADA**     — la noche de hoy está vendida o hay una llegada futura.
 *   5. **LIBRE**         — en cualquier otro caso.
 *
 * Es una función **pura** para que la API y las pruebas compartan el mismo criterio.
 */
export function resolveRoomDetailState(input: RoomDetailStateInput): RoomDetailState {
  const { hasOpenMaintenance, operationalStatus, nightStatus, hasUpcomingReservation } = input;

  if (hasOpenMaintenance) return "MANTENIMIENTO";
  if (nightStatus === "CHECKED_IN" || operationalStatus === "OCCUPIED") return "OCUPADA";
  if (operationalStatus === "PENDING_CLEANING" || nightStatus === "CHECKED_OUT") {
    return "PENDIENTE_LIMPIEZA";
  }
  if (nightStatus === "SOLD" || nightStatus === "CONFIRMING" || hasUpcomingReservation) {
    return "RESERVADA";
  }
  return "LIBRE";
}
