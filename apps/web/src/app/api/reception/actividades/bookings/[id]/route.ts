import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository, ActivityError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/reception/actividades/bookings/[id] — cancela una inscripción (F5 · D-46/D-47).
 *
 * Cancela el cargo asociado y **promociona** la primera plaza de la lista de espera; la respuesta
 * incluye la inscripción promocionada para que recepción avise al huésped. Rol `RECEPTION_ROLE`.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const result = await repo.cancelBooking(id, auth.session.username);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ActivityError) {
      const status = error.code === "BOOKING_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/reception/actividades/bookings/[id]] DELETE:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo cancelar la inscripción." }, { status: 500 });
  }
}
