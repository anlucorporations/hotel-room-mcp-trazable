import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository, RoomsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();
const maintenanceRepo = new MaintenanceRepository();

/**
 * GET /api/public/rooms — habitaciones **reservables** desde la web pública (F6 · D-65, D-72).
 *
 * Endpoint **público** (sin sesión): devuelve solo lo necesario para reservar —id, número, tipo y
 * tarifa base en wei de las habitaciones publicadas— excluyendo las archivadas y las **bloqueadas por
 * avería** (D-53). No expone descripciones ni datos internos.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const [rooms, blocked] = await Promise.all([
      roomsRepo.listRooms(),
      maintenanceRepo.listBlockedRoomIds(),
    ]);
    const blockedIds = new Set(blocked);
    const reservable = rooms
      .filter((room) => room.publicationStatus === "PUBLISHED" && !blockedIds.has(room.id))
      .map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        baseRateWei: room.baseRateWei,
      }));
    return NextResponse.json({ rooms: reservable });
  } catch (error: unknown) {
    console.error("[API /api/public/rooms] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las habitaciones." },
      { status: 500 },
    );
  }
}
