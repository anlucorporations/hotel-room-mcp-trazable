import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/public/reservations/[id]/settle — **liquidación al 100 %** desde la web pública
 * (F6 · D-65, D-72, D-57).
 *
 * Calcula el plan de liquidación noche a noche: **asigna** el token no vendido que ya exista, marca
 * `needsMint` si hay que emitirlo o `conflicts` si la noche la compró otra persona. El pago en sí lo
 * firma la wallet del huésped al comprar el token (D-60); aquí solo se concilia la reserva con el
 * inventario. El `id` (UUID v4) actúa como capacidad.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  try {
    const plan = await reservationsRepo.planSettlement(id);
    if (!plan) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    if (plan.conflicts.length > 0) {
      return NextResponse.json(
        { error: "SETTLEMENT_CONFLICT", message: "Alguna noche ya fue comprada por otra persona.", plan },
        { status: 409 },
      );
    }
    return NextResponse.json({ plan });
  } catch (error: unknown) {
    console.error("[API /api/public/reservations/[id]/settle] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo liquidar la reserva." }, { status: 500 });
  }
}
