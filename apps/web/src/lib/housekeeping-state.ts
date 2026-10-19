import "server-only";
import { isCacheFresh } from "./state-board-cache";
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

/**
 * Caché de muy corta vida del tablero (RNF-M-05). El tablero se refresca por sondeo/SSE cada ≤2 s y
 * varias peticiones concurrentes piden exactamente el mismo dato: compartir una lectura durante
 * `STATE_BOARD_CACHE_MS` (1 s por defecto) evita multiplicar consultas y mantiene el p95 dentro del
 * SLA sin retrasar la frescura más de un ciclo de sondeo. El SSE sigue detectando cambios por firma.
 */
const STATE_BOARD_CACHE_MS = Number(process.env.STATE_BOARD_CACHE_MS ?? 1_000);
interface CachedBoard {
  readonly data: RoomStateBoardData;
  readonly at: number;
}
let cachedBoard: { key: string; value: CachedBoard } | null = null;
const inflightBoards = new Map<string, Promise<RoomStateBoardData>>();

const isStateBoardCacheFresh = (
  cached: { key: string; value: { at: number } } | null,
  key: string,
  now: number,
): boolean => isCacheFresh(cached, key, now, STATE_BOARD_CACHE_MS);

/** Reinicia la caché (pruebas). */
export function resetStateBoardCache(): void {
  cachedBoard = null;
  inflightBoards.clear();
}

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
  const now = Date.now();
  if (isStateBoardCacheFresh(cachedBoard, date, now)) {
    return cachedBoard!.value.data;
  }
  const pending = inflightBoards.get(date);
  if (pending) return pending;
  const request = (async (): Promise<RoomStateBoardData> => {
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
    const data: RoomStateBoardData = {
      date,
      rooms: rows,
      summary: summarizeRoomStates(rows),
      generatedAt: new Date().toISOString(),
    };
    cachedBoard = { key: date, value: { data, at: Date.now() } };
    return data;
  })();
  inflightBoards.set(date, request);
  try {
    return await request;
  } finally {
    inflightBoards.delete(date);
  }
}
