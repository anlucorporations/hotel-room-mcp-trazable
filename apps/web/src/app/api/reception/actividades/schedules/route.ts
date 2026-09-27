import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

/**
 * GET /api/reception/actividades/schedules?date=AAAA-MM-DD — horarios del día con su ocupación
 * (F5 · D-44/D-47). Rol `RECEPTION_ROLE` (el owner también entra). Devuelve solo los horarios
 * activos de actividades activas, con plazas libres y cola de espera.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date");
  const day = date ?? new Date().toISOString().slice(0, 10);
  if (!isIsoDate(day)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + 24 * 3600_000);

  try {
    const schedules = await repo.listSchedules({ from, to, activeOnly: true });
    return NextResponse.json({ date: day, schedules });
  } catch (error: unknown) {
    console.error("[API /api/reception/actividades/schedules] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los horarios." }, { status: 500 });
  }
}
