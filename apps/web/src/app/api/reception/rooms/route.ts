import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository, RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const maintenanceRepo = new MaintenanceRepository();

/**
 * GET /api/reception/rooms — habitaciones **publicadas y vendibles** para el motor de reservas
 * (D-34, D-26, D-53).
 *
 * Recepción necesita elegir habitación al crear una reserva, pero la API de administración exige
 * `DEFAULT_ADMIN_ROLE`. Este endpoint expone solo lo mínimo (id, número y tipo) de las habitaciones
 * `PUBLISHED` y no archivadas, protegido por `RECEPTION_ROLE`. **Excluye las bloqueadas por una
 * avería abierta** (D-53): no se ofrece lo que no se puede vender.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const [rooms, blocked] = await Promise.all([
      roomsRepo.listRooms(),
      maintenanceRepo.listBlockedRoomIds(),
    ]);
    const blockedIds = new Set(blocked);
    const published = rooms
      .filter((room) => room.publicationStatus === "PUBLISHED" && !blockedIds.has(room.id))
      .map((room) => ({ id: room.id, roomNumber: room.roomNumber, roomType: room.roomType }));
    return NextResponse.json({ rooms: published });
  } catch (error: unknown) {
    console.error("[API /api/reception/rooms] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las habitaciones." },
      { status: 500 },
    );
  }
}
