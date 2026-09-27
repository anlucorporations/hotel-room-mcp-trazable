import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository, type PreventiveTaskStatus } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/tasks — tareas preventivas del técnico (D-54/D-63).
 *
 * `?due=AAAA-MM-DD` devuelve las **vencidas o de hoy** (el aviso); `?planId=…` y `?status=…` filtran
 * el resto. Rol `MAINTENANCE` (owner incluido).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "MAINTENANCE");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const due = params.get("due");
  try {
    if (due !== null) {
      if (!isIsoDate(due)) {
        return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
      }
      return NextResponse.json({ date: due, tasks: await repo.listDueTasks(due), due: true });
    }
    const tasks = await repo.listTasks({
      planId: params.get("planId") ?? undefined,
      status: (params.get("status") as PreventiveTaskStatus | null) ?? undefined,
    });
    return NextResponse.json({ tasks, due: false, date: defaultBoardDate() });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/tasks] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las tareas." }, { status: 500 });
  }
}
