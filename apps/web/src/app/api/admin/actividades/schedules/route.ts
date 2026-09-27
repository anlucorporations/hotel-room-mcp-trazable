import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository, ActivityError } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

/** Convierte una fecha ISO a `Date`, o `null` si no es válida. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET/POST /api/admin/actividades/schedules — horarios del catálogo (F5 · D-44/D-47, solo owner).
 *
 * `GET` admite `activityId`, `from` y `to`; devuelve cada horario con su **ocupación** y plazas libres.
 * `POST` crea un horario con **cupo estricto** (`capacity > 0`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  try {
    const schedules = await repo.listSchedules({
      activityId: params.get("activityId") ?? undefined,
      from: parseDate(params.get("from")) ?? undefined,
      to: parseDate(params.get("to")) ?? undefined,
    });
    return NextResponse.json({ schedules });
  } catch (error: unknown) {
    console.error("[API /api/admin/actividades/schedules] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los horarios." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  let body: { activityId?: unknown; startsAt?: unknown; endsAt?: unknown; capacity?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const startsAt = parseDate(typeof body.startsAt === "string" ? body.startsAt : null);
  const endsAt = parseDate(typeof body.endsAt === "string" ? body.endsAt : null);
  const capacity = typeof body.capacity === "number" ? body.capacity : NaN;
  if (typeof body.activityId !== "string" || !startsAt || !Number.isInteger(capacity) || capacity <= 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se requieren activityId, startsAt (ISO) y capacity (entero > 0)." },
      { status: 400 },
    );
  }

  try {
    const schedule = await repo.createSchedule({
      activityId: body.activityId,
      startsAt,
      endsAt,
      capacity,
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ActivityError) {
      const status = error.code === "ACTIVITY_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/admin/actividades/schedules] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el horario." }, { status: 500 });
  }
}
