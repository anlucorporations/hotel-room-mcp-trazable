import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/**
 * GET /api/reception/rooms — habitaciones **publicadas** para el motor de reservas (D-34, D-26).
 *
 * Recepción necesita elegir habitación al crear una reserva, pero la API de administración exige
 * `DEFAULT_ADMIN_ROLE`. Este endpoint expone solo lo mínimo (id, número y tipo) de las habitaciones
 * `PUBLISHED` y no archivadas, protegido por `RECEPTION_ROLE`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const rooms = await roomsRepo.listRooms();
    const published = rooms
      .filter((room) => room.publicationStatus === "PUBLISHED")
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
