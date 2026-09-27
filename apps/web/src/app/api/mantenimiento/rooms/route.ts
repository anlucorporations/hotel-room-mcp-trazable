import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/**
 * GET /api/mantenimiento/rooms — habitaciones para **reportar una avería** (D-52).
 *
 * Recepción y limpieza necesitan elegir la habitación al reportar. Devuelve solo id, número y tipo
 * de las habitaciones vigentes (no archivadas y no fuera de servicio). Se incluyen las bloqueadas por
 * otra avería: sobre una habitación bloqueada puede reportarse un problema adicional.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["RECEPTION_ROLE", "HOUSEKEEPING", "MAINTENANCE"]);
  if (!auth.ok) return auth.response;

  try {
    const rooms = await roomsRepo.listRooms();
    const reportable = rooms
      .filter((room) => room.publicationStatus !== "OUT_OF_SERVICE")
      .map((room) => ({ id: room.id, roomNumber: room.roomNumber, roomType: room.roomType }));
    return NextResponse.json({ rooms: reportable });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/rooms] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las habitaciones." }, { status: 500 });
  }
}
