import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/mantenimiento/plans/[id] — activa o pausa un plan preventivo (D-54, solo owner). */
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
    const plan = await repo.setPlanActive(id, body.active);
    if (!plan) {
      return NextResponse.json({ error: "PLAN_NOT_FOUND", message: "El plan no existe." }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (error: unknown) {
    console.error("[API /api/admin/mantenimiento/plans/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar el plan." }, { status: 500 });
  }
}
