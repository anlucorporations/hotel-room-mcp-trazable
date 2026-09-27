import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

/**
 * POST /api/reception/reservations/[id]/confirm — confirma la reserva (anticipo pagado).
 *
 * No emite token: el token se emite al pagar el **100 %** (D-39), con la regla reserva↔token (D-57).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const reservation = await reservationsRepo.confirmReservation(id, auth.session.username);
    if (!reservation) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    return NextResponse.json({ reservation });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/[id]/confirm] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo confirmar la reserva." },
      { status: 500 },
    );
  }
}
