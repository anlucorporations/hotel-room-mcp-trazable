import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingError, HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate, parseShiftLabel } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/**
 * GET /api/housekeeping/shifts?date=AAAA-MM-DD — turnos del día (D-48).
 * POST /api/housekeeping/shifts — alta de turno `{ date, label, supervisor }`.
 *
 * Rol `HOUSEKEEPING` (el owner también entra, D-56/D-62). El turno agrupa el reparto automático y el
 * tablero del día. Solo hay un turno por día y etiqueta.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    return NextResponse.json({ date, shifts: await repo.listShifts(date) });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/shifts] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los turnos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  let body: { date?: unknown; label?: unknown; supervisor?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const date = typeof body.date === "string" ? body.date : defaultBoardDate();
  const label = parseShiftLabel(body.label);
  const supervisor = typeof body.supervisor === "string" ? body.supervisor.trim() : auth.session.username;
  if (!isIsoDate(date) || !label) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se requieren date (AAAA-MM-DD) y label (MANANA/TARDE/NOCHE)." }, { status: 400 });
  }

  try {
    const shift = await repo.createShift({ shiftDate: date, label, supervisor });
    return NextResponse.json({ shift }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/housekeeping/shifts] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el turno." }, { status: 500 });
  }
}
