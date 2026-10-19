import "server-only";
import {
  MaintenanceRepository,
  RoomsRepository,
  buildRoomStateBoard,
  summarizeRoomStates,
  type RoomStateBoardEntry,
  type RoomStateToken,
} from "@hotel/shared";

/**
 * Lectura del **tablero de estado operativo** (F6 · T6.2/T6.5).
 *
 * Cruza el maestro `rooms` (estado operativo y de publicación) con las incidencias que bloquean la
 * venta (`maintenance.listBlockedRoomIds`). El resultado es la fuente única del tablero y del SSE:
 * página, endpoint y stream pintan exactamente lo mismo.
 */

const roomsRepo = new RoomsRepository();
const maintenanceRepo = new MaintenanceRepository();

export interface RoomStateBoardData {
  readonly date: string;
  readonly rooms: RoomStateBoardEntry[];
  readonly summary: Record<RoomStateToken, number>;
  readonly generatedAt: string;
}

/** Firma estable del tablero (para emitir por SSE solo cuando algo cambió). */
export function roomStateSignature(data: Pick<RoomStateBoardData, "rooms">): string {
  return JSON.stringify(
    data.rooms.map((room) => `${room.roomId}:${room.state}:${room.roomNumber}`).sort(),
  );
}

export async function fetchRoomStateBoard(date: string): Promise<RoomStateBoardData> {
  const [rooms, blockedIds] = await Promise.all([
    roomsRepo.listRooms(),
    maintenanceRepo.listBlockedRoomIds(),
  ]);
  const blocked = new Set(blockedIds);
  const rows = buildRoomStateBoard(
    rooms.map((room) => ({
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      operationalStatus: room.operationalStatus,
      publicationStatus: room.publicationStatus,
      blockedByMaintenance: blocked.has(room.id) || room.publicationStatus === "MAINTENANCE",
    })),
  );
  return {
    date,
    rooms: rows,
    summary: summarizeRoomStates(rows),
    generatedAt: new Date().toISOString(),
  };
}
