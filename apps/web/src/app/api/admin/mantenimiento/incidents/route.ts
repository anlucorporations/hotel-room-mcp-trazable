import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository, type MaintenanceStatus } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/admin/mantenimiento/incidents — todas las incidencias (Administración → Mantenimiento).
 *
 * `?status=…` filtra por estado. Solo owner: es la vista de supervisión; el técnico usa
 * `/api/mantenimiento/incidents`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  try {
    const status = request.nextUrl.searchParams.get("status");
    const incidents = await repo.listIncidents({ status: (status as MaintenanceStatus | null) ?? undefined });
    return NextResponse.json({ incidents });
  } catch (error: unknown) {
    console.error("[API /api/admin/mantenimiento/incidents] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las incidencias." }, { status: 500 });
  }
}
