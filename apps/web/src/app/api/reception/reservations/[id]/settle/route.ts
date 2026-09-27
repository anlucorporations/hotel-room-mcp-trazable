import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

/**
 * POST /api/reception/reservations/[id]/settle — plan de liquidación al 100 % (D-57/D-60).
 *
 * Para cada noche retenida: si ya existe un token **no vendido**, se **asigna** a la reserva; si no
 * existe, se anota que hay que **acuñarlo**; si el token ya lo compró otro, es un **conflicto** (409).
 *
 * No emite ninguna transacción: la compra/acuñado on-chain la firma la wallet del huésped (D-60). Este
 * endpoint deja el inventario preparado y enlazado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const plan = await reservationsRepo.planSettlement(id);
    if (!plan) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    if (plan.conflicts.length > 0) {
      return NextResponse.json(
        {
          error: "SETTLEMENT_CONFLICT",
          message: "Alguna noche ya fue vendida o consumida por otra persona.",
          plan,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ plan, ready: plan.needsMint.length === 0 });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/[id]/settle] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo preparar la liquidación." },
      { status: 500 },
    );
  }
}
