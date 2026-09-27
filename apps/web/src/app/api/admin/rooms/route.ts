import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RoomsRepository, RoomRepositoryError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { parseRoomFields } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const roomsRepo = new RoomsRepository();

/**
 * GET /api/admin/rooms — lista las habitaciones (D-1, D-3).
 *
 * Protegida: exige `DEFAULT_ADMIN_ROLE` (owner). Por defecto **excluye las archivadas** (D-8);
 * `?includeArchived=true` las incluye para el historial.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const rooms = await roomsRepo.listRooms({ includeArchived });
    return NextResponse.json({ rooms });
  } catch (error: unknown) {
    console.error("[API /api/admin/rooms] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las habitaciones." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/rooms — crea una habitación en estado `DRAFT` (D-1, D-7, D-21, D-22).
 *
 * El número es único y puede estar fuera de los rangos históricos (D-7). La descripción en español
 * solo se exige al **publicar** (D-6); aquí basta con los datos de identificación.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = parseRoomFields(body, { partial: false });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, message: parsed.message }, { status: 400 });
  }

  try {
    const room = await roomsRepo.createRoom({
      roomNumber: parsed.fields.roomNumber!,
      floor: parsed.fields.floor ?? null,
      roomType: parsed.fields.roomType!,
      capacity: parsed.fields.capacity!,
      beds: parsed.fields.beds!,
      sizeM2: parsed.fields.sizeM2 ?? null,
      descriptionEs: parsed.fields.descriptionEs ?? null,
      descriptionEn: parsed.fields.descriptionEn ?? null,
      descriptionRu: parsed.fields.descriptionRu ?? null,
      baseRateWei: parsed.fields.baseRateWei ?? null,
    });
    return NextResponse.json({ room }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof RoomRepositoryError && error.code === "ROOM_NUMBER_TAKEN") {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/rooms] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear la habitación." },
      { status: 500 },
    );
  }
}
