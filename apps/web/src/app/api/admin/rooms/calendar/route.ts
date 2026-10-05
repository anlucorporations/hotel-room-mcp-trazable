import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository, type RoomDayStateRecord } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { BOARD_MAX_DAYS, aggregateBoardDays, enumerateDates, type BoardRange } from "@/lib/room-board-calendar";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Habitación con su estado en el día consultado. */
interface RoomDayEntry {
  id: string;
  roomNumber: number;
  roomType: string;
  floor: number | null;
  publicationStatus: string;
  operationalStatus: string;
  published: boolean;
  reserved: boolean;
  occupied: boolean;
  maintenance: boolean;
}

/**
 * GET /api/admin/rooms/calendar — tablero de disponibilidad (2026-10-04).
 *
 * Dos modos, ambos de **solo lectura**:
 *   · `?from=AAAA-MM-DD&to=AAAA-MM-DD` → totales por día (publicadas, reservadas, ocupadas y en
 *     mantenimiento) para el mapa de día/semana/mes/trimestre;
 *   · `?date=AAAA-MM-DD` → **todas** las habitaciones con su estado ese día, que es lo que necesita
 *     el panel de gestión (publicar, reservar, liberar, servicios).
 *
 * Acceso: `DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE` (decisión del responsable: recepción entra con
 * límites; publicar y acuñar siguen exigiendo owner/`MINTER_ROLE` en sus propios endpoints).
 *
 * El mantenimiento es un estado **actual** (publicación en mantenimiento o incidencia abierta que
 * bloquea la venta) y se pinta en todos los días del rango: las incidencias no tienen día programado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["DEFAULT_ADMIN_ROLE", "RECEPTION_ROLE"]);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const date = params.get("date");
  const from = params.get("from");
  const to = params.get("to");

  try {
    if (date !== null) {
      if (!DATE_RE.test(date)) {
        return NextResponse.json(
          { error: "INVALID_DATE", message: "La fecha debe ser AAAA-MM-DD." },
          { status: 400 },
        );
      }
      return NextResponse.json(await dayDetail(date));
    }

    if (from === null || to === null || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json(
        { error: "INVALID_RANGE", message: "Se requiere from y to (AAAA-MM-DD) o date (AAAA-MM-DD)." },
        { status: 400 },
      );
    }
    if (from > to) {
      return NextResponse.json(
        { error: "INVALID_RANGE", message: "from no puede ser posterior a to." },
        { status: 400 },
      );
    }

    const range: BoardRange = { from, to };
    if (enumerateDates(range, BOARD_MAX_DAYS + 1).length > BOARD_MAX_DAYS) {
      return NextResponse.json(
        { error: "RANGE_TOO_LARGE", message: `El rango no puede superar ${BOARD_MAX_DAYS} días.` },
        { status: 400 },
      );
    }

    const [states, maintenanceRoomIds] = await Promise.all([
      roomsRepo.listRoomDayStates(from, to),
      roomsRepo.listRoomIdsInMaintenance(),
    ]);
    return NextResponse.json({
      range,
      days: aggregateBoardDays(states, maintenanceRoomIds, range),
      maintenanceRooms: maintenanceRoomIds.length,
    });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/calendar] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el tablero de disponibilidad." },
      { status: 500 },
    );
  }
}

/** Estado de **todas** las habitaciones en un día, con el resumen de ese día. */
async function dayDetail(date: string): Promise<{
  date: string;
  rooms: RoomDayEntry[];
  summary: { published: number; reserved: number; occupied: number; maintenance: number };
}> {
  const [rooms, states, maintenanceRoomIds] = await Promise.all([
    roomsRepo.listRooms(),
    roomsRepo.listRoomDayStates(date, date),
    roomsRepo.listRoomIdsInMaintenance(),
  ]);

  const byRoom = new Map<string, RoomDayStateRecord>();
  for (const state of states) byRoom.set(state.roomId, state);
  const maintenance = new Set(maintenanceRoomIds);

  const entries: RoomDayEntry[] = rooms.map((room) => {
    const state = byRoom.get(room.id);
    return {
      id: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      floor: room.floor,
      publicationStatus: room.publicationStatus,
      operationalStatus: room.operationalStatus,
      published: state?.published === true,
      reserved: state?.reserved === true,
      occupied: state?.occupied === true,
      maintenance: maintenance.has(room.id),
    };
  });

  return {
    date,
    rooms: entries,
    summary: {
      published: entries.filter((entry) => entry.published).length,
      reserved: entries.filter((entry) => entry.reserved).length,
      occupied: entries.filter((entry) => entry.occupied).length,
      maintenance: entries.filter((entry) => entry.maintenance).length,
    },
  };
}
