import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository, ActivityError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

/**
 * GET/POST /api/reception/actividades/bookings — inscripciones en actividades (F5 · D-45…D-47).
 *
 * `GET` lista por `scheduleId` o `reservationId`. `POST` inscribe a un huésped con **estancia activa**
 * (D-45), con **cupo estricto** y **lista de espera opcional** (D-47) y **cargo al folio** (D-46).
 * Rol `RECEPTION_ROLE`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  try {
    const bookings = await repo.listBookings({
      scheduleId: params.get("scheduleId") ?? undefined,
      reservationId: params.get("reservationId") ?? undefined,
    });
    return NextResponse.json({ bookings });
  } catch (error: unknown) {
    console.error("[API /api/reception/actividades/bookings] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las inscripciones." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  let body: { scheduleId?: unknown; reservationId?: unknown; seats?: unknown; allowWaitlist?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.scheduleId !== "string" || typeof body.reservationId !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se requieren scheduleId y reservationId." }, { status: 400 });
  }

  try {
    const booking = await repo.book({
      scheduleId: body.scheduleId,
      reservationId: body.reservationId,
      seats: typeof body.seats === "number" ? body.seats : 1,
      allowWaitlist: body.allowWaitlist === true,
      createdBy: auth.session.username,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ActivityError) {
      const status =
        error.code === "SCHEDULE_NOT_FOUND" ? 404 : error.code === "SOLD_OUT" || error.code === "STAY_NOT_ACTIVE" ? 409 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/reception/actividades/bookings] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo inscribir." }, { status: 500 });
  }
}
