import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/**
 * GET /api/admin/rooms/options — catálogos que alimentan el formulario de habitación (2026-10-02).
 *
 * Devuelve los tres catálogos que viven en la base: tipos de habitación (con su royalty inmutable),
 * servicios/amenidades y espacios. Las listas **cerradas de código** (vistas y estilos decorativos)
 * no se sirven por aquí: viven en `lib/room-fields.ts`, que el formulario importa directamente.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const [roomTypes, amenities, spaceTypes] = await Promise.all([
      roomsRepo.listRoomTypes(),
      roomsRepo.listAmenityCatalog(),
      roomsRepo.listSpaceTypes(),
    ]);
    return NextResponse.json({ roomTypes, amenities, spaceTypes });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms/options] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron leer los catálogos de habitación." },
      { status: 500 },
    );
  }
}
