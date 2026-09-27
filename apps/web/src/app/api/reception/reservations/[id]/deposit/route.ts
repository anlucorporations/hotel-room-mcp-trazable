import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

/**
 * POST /api/reception/reservations/[id]/deposit — registra el anticipo cobrado off-chain (D-60).
 *
 * La liquidación (100 %) se paga con wallet on-chain al comprar el token (D-39); aquí solo se anota
 * lo cobrado en mostrador/transferencia.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { amountCents?: unknown } | null;
  const amountCents = Number(body?.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "amountCents debe ser un entero positivo." },
      { status: 400 },
    );
  }

  try {
    const reservation = await reservationsRepo.recordDeposit(id, Math.round(amountCents));
    if (!reservation) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    return NextResponse.json({ reservation });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/[id]/deposit] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar el anticipo." },
      { status: 500 },
    );
  }
}
