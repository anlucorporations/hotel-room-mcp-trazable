import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MaintenanceError,
  MaintenanceRepository,
  PREVENTIVE_PERIODICITIES,
  type PreventivePeriodicity,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET/POST /api/admin/mantenimiento/plans — planes de mantenimiento preventivo (D-54, solo owner).
 *
 * `POST` da de alta el plan y **su primera tarea** con la fecha indicada. A partir de ahí, cerrar una
 * tarea programa la siguiente según la periodicidad. Los planes preventivos viven en Administración
 * → Mantenimiento (la ruta de personal `/mantenimiento` solo ejecuta).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ plans: await repo.listPlans() });
  } catch (error: unknown) {
    console.error("[API /api/admin/mantenimiento/plans] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los planes." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  let body: {
    code?: unknown;
    name?: unknown;
    equipment?: unknown;
    roomId?: unknown;
    periodicity?: unknown;
    firstDueDate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const equipment = typeof body.equipment === "string" ? body.equipment.trim() : "";
  const firstDueDate = typeof body.firstDueDate === "string" ? body.firstDueDate : "";
  const periodicity =
    typeof body.periodicity === "string" && (PREVENTIVE_PERIODICITIES as readonly string[]).includes(body.periodicity)
      ? (body.periodicity as PreventivePeriodicity)
      : null;

  if (!code || !name || !equipment || !periodicity || !isIsoDate(firstDueDate)) {
    return NextResponse.json(
      {
        error: "BAD_REQUEST",
        message: "Se requieren code, name, equipment, firstDueDate (AAAA-MM-DD) y periodicity (WEEKLY/MONTHLY/QUARTERLY).",
      },
      { status: 400 },
    );
  }

  try {
    const plan = await repo.createPlan({
      code,
      name,
      equipment,
      roomId: typeof body.roomId === "string" && body.roomId.length > 0 ? body.roomId : null,
      periodicity,
      firstDueDate,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/admin/mantenimiento/plans] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo crear el plan." }, { status: 500 });
  }
}
