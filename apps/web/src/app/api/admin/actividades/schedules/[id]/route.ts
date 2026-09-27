import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ActivitiesRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new ActivitiesRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/actividades/schedules/[id] — activa o cierra un horario (D-44, solo owner). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { active?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "active debe ser booleano." }, { status: 400 });
  }
  try {
    const schedule = await repo.setScheduleActive(id, body.active);
    if (!schedule) {
      return NextResponse.json({ error: "SCHEDULE_NOT_FOUND", message: "El horario no existe." }, { status: 404 });
    }
    return NextResponse.json({ schedule });
  } catch (error: unknown) {
    console.error("[API /api/admin/actividades/schedules/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el horario." }, { status: 500 });
  }
}
