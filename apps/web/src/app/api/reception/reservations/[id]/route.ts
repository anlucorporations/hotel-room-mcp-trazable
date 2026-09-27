import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReservationError, ReservationsRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const reservationsRepo = new ReservationsRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/reception/reservations/[id] — reserva, noches, folio y contacto (D-34/D-55). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const found = await reservationsRepo.findById(id);
    if (!found) {
      return NextResponse.json({ error: "NOT_FOUND", message: "La reserva no existe." }, { status: 404 });
    }
    const [folio, contact] = await Promise.all([
      reservationsRepo.findFolio(id),
      reservationsRepo.getContact(id),
    ]);
    return NextResponse.json({ ...found, folio, contact });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/[id]] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la reserva." },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/reception/reservations/[id] — modifica fechas y/o habitación con recálculo (D-43).
 * Libera las noches anteriores y retiene las nuevas; 409 si alguna no está libre.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se espera un objeto JSON." }, { status: 400 });
  }

  try {
    const reservation = await reservationsRepo.modifyReservation(
      id,
      {
        checkInDate: typeof body.checkInDate === "string" ? body.checkInDate : undefined,
        checkOutDate: typeof body.checkOutDate === "string" ? body.checkOutDate : undefined,
        roomId: typeof body.roomId === "string" ? body.roomId : undefined,
        totalCents: typeof body.totalCents === "number" ? body.totalCents : undefined,
      },
      auth.session.username,
    );
    if (!reservation) {
      return NextResponse.json(
        { error: "INVALID_STATE", message: "La reserva no existe o no se puede modificar en su estado." },
        { status: 409 },
      );
    }
    return NextResponse.json({ reservation });
  } catch (error: unknown) {
    if (error instanceof ReservationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "UNAVAILABLE" ? 409 : 400 });
    }
    console.error("[API /api/reception/reservations/[id]] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo modificar la reserva." },
      { status: 500 },
    );
  }
}

/** DELETE /api/reception/reservations/[id] — cancela y libera el inventario (D-40). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  try {
    const reservation = await reservationsRepo.cancelReservation(id, auth.session.username, reason);
    if (!reservation) {
      return NextResponse.json(
        { error: "INVALID_STATE", message: "La reserva no existe o ya está cerrada." },
        { status: 409 },
      );
    }
    return NextResponse.json({ reservation });
  } catch (error: unknown) {
    console.error("[API /api/reception/reservations/[id]] DELETE:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo cancelar la reserva." },
      { status: 500 },
    );
  }
}
