import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationError, ReservationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

/**
 * GET /api/reception/availability?roomId=…&from=AAAA-MM-DD&to=AAAA-MM-DD
 *
 * Disponibilidad **exacta** noche a noche de una habitación (D-41/D-57): `FREE`, `RESERVED` o `SOLD`.
 * Protegida: `RECEPTION_ROLE` o owner (D-37). Sin sobreventa: si una noche está reservada o vendida,
 * no se ofrece.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const roomId = params.get("roomId");
  const from = params.get("from");
  const to = params.get("to");
  if (!roomId || !from || !to) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren roomId, from y to." },
      { status: 400 },
    );
  }

  try {
    const nights = await reservationsRepo.checkAvailability(roomId, from, to);
    return NextResponse.json({ nights, available: nights.every((night) => night.status === "FREE") });
  } catch (error: unknown) {
    if (error instanceof ReservationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    console.error("[API /api/reception/availability] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo calcular la disponibilidad." },
      { status: 500 },
    );
  }
}
