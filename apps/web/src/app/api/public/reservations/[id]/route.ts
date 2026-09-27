import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/public/reservations/[id] — estado de una reserva pública (F6 · D-65, D-72).
 *
 * El `id` (UUID v4) actúa como **capacidad**: quien lo tiene puede consultar su reserva sin sesión.
 * No se devuelve el contacto (ni correo ni wallet) ni ningún dato personal.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  try {
    const found = await reservationsRepo.findById(id);
    if (!found) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    const { reservation, nights } = found;
    return NextResponse.json({
      reservation: {
        id: reservation.id,
        roomNumber: reservation.roomNumber,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        status: reservation.status,
        totalCents: reservation.totalCents,
        depositRequiredCents: reservation.depositRequiredCents,
        depositPaidCents: reservation.depositPaidCents,
        holdExpiresAt: reservation.holdExpiresAt,
        confirmedAt: reservation.confirmedAt,
        cancelledAt: reservation.cancelledAt,
      },
      nights: nights.map((night) => ({ nightDate: night.nightDate, assigned: night.tokenId !== null })),
    });
  } catch (error: unknown) {
    console.error("[API /api/public/reservations/[id]] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la reserva." }, { status: 500 });
  }
}
