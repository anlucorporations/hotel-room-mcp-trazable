import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceError, MaintenanceRepository, validationRemainingMs } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/validaciones — cola de validación del jefe (F8 · T8.5, RNF-M-21).
 * PATCH — valida una tarea cerrada por el terminal `{ taskId }` (24 h).
 *
 * Devuelve tareas `PENDING_VERIFICATION` y `PENDING_VERIFICATION_EXPIRED` con el tiempo restante del
 * SLA (`remainingMs`). Las vencidas se muestran como escaladas al Administrador.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;
  try {
    const tasks = await repo.listValidationQueue();
    const now = Date.now();
    return NextResponse.json({
      tasks: tasks.map((task) => ({
        id: task.id,
        planName: task.planName,
        equipment: task.equipment,
        roomNumber: task.roomNumber,
        areaName: task.areaName,
        completedBy: task.completedBy,
        completedAt: task.completedAt,
        dueDate: task.dueDate,
        validationStatus: task.validationStatus,
        remainingMs: validationRemainingMs(task.completedAt, new Date(now)),
        expired: task.validationStatus === "PENDING_VERIFICATION_EXPIRED",
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/validaciones] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer la cola de validación." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;
  let body: { taskId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.taskId !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "taskId es obligatorio." }, { status: 400 });
  }
  try {
    const task = await repo.validateTask(body.taskId, auth.session.username);
    return NextResponse.json({ task: { id: task.id, validationStatus: task.validationStatus, completedBy: task.completedBy } });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status = error.code === "VALIDATION_NOT_PENDING" ? 409 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/mantenimiento/validaciones] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo validar la tarea." },
      { status: 500 },
    );
  }
}
