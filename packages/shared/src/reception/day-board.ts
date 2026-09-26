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

/** Traduce el estado del índice (`nfts`) al estado del panel. Un estado desconocido es LIBRE. */
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
 */
export function buildRoomBoard(
  rooms: readonly number[],
  nights: readonly BoardNight[],
): RoomBoardCell[] {
  const byRoom = new Map<number, string>();
  for (const night of nights) {
    const previous = byRoom.get(night.roomNumber);
    byRoom.set(night.roomNumber, previous === undefined ? night.status : mostSevere(previous, night.status));
  }

  return rooms.map((roomNumber) => ({
    roomNumber,
    roomType: roomTypeOf(roomNumber),
    status: roomBoardStatus(byRoom.get(roomNumber) ?? "AVAILABLE"),
  }));
}

const SEVERITY: readonly RoomBoardStatus[] = [
  "LIBRE",
  "PENDIENTE",
  "RESERVADA",
  "OCUPADA",
  "SALIDA",
  "BLOQUEADA",
];

function mostSevere(a: string, b: string): string {
  return SEVERITY.indexOf(roomBoardStatus(b)) > SEVERITY.indexOf(roomBoardStatus(a)) ? b : a;
}
