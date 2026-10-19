import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MaintenanceError,
  MaintenanceRepository,
  preventiveTaskRequiresSignature,
  type PreventiveTaskRecord,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { MAINTENANCE_SUITE_ROLES } from "@/lib/mantenimiento/roles";
import { assertSignatureAuthorizes, isUuid } from "@/lib/mantenimiento/signatures";
import { signatureErrorResponse } from "@/lib/mantenimiento/errors";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/preventivo — planes y tareas preventivas (F4 · T4.4).
 *
 * `?due=AAAA-MM-DD` devuelve las **vencidas o de hoy** (aviso D-54) y `?status=` filtra el resto.
 * Cada tarea sale con `requiresSignature` ya resuelto (área crítica o marca explícita), que es lo
 * que la UI usa para exigir el flujo de firma (D-C23).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, [...MAINTENANCE_SUITE_ROLES]);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const due = params.get("due");
  const status = params.get("status") as "PENDING" | "DONE" | "SKIPPED" | null;
  try {
    const [plans, tasks] = await Promise.all([
      repo.listPlans(),
      due !== null
        ? repo.listDueTasks(due)
        : repo.listTasks(status === null ? {} : { status }),
    ]);
    return NextResponse.json({ plans, tasks });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/preventivo] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las tareas preventivas." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mantenimiento/preventivo — cierra una tarea (F4 · T4.5).
 *
 * Cuerpo: `{ taskId, action: "complete"|"skip", notes?, evidencePath?, signatureId? }`.
 *
 * Si la tarea es de un área **crítica**, `signatureId` es obligatorio y debe autorizar exactamente
 * esta tarea (`PREVENTIVE_TASK`); una firma de otra entidad o payload no vale. La evidencia es
 * opcional: su ausencia solo se avisa (`evidence-missing`, D-C12), no bloquea.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, [...MAINTENANCE_SUITE_ROLES]);
  if (!auth.ok) return auth.response;

  let body: {
    taskId?: unknown;
    action?: unknown;
    notes?: unknown;
    evidencePath?: unknown;
    signatureId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (!isUuid(body.taskId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "taskId no es un UUID válido." }, { status: 400 });
  }
  if (body.action !== "complete" && body.action !== "skip") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "action debe ser 'complete' o 'skip'." },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : null;
  const evidencePath = typeof body.evidencePath === "string" ? body.evidencePath.trim().slice(0, 500) : null;
  const signatureId = body.signatureId === undefined || body.signatureId === null ? null : body.signatureId;
  if (signatureId !== null && !isUuid(signatureId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signatureId no es un UUID válido." }, { status: 400 });
  }

  try {
    const task = await repo.findTask(body.taskId);
    if (!task) {
      return NextResponse.json({ error: "TASK_NOT_FOUND", message: "La tarea no existe." }, { status: 404 });
    }
    const requiresSignature = task.requiresSignature || preventiveTaskRequiresSignature(task.isCritical);
    if (requiresSignature && !signatureId) {
      return NextResponse.json(
        {
          error: "SIGNATURE_REQUIRED",
          message: "La tarea es de un área crítica: hace falta firmar la verificación.",
        },
        { status: 409 },
      );
    }
    if (signatureId) {
      await assertSignatureAuthorizes({
        signatureId,
        action: "PREVENTIVE_TASK",
        entityUuid: task.id,
        payload: { taskId: task.id },
      });
    }
    const result =
      body.action === "complete"
        ? await repo.completeTask(task.id, auth.session.username, notes, { signatureId, evidencePath })
        : await repo.skipTask(task.id, auth.session.username, notes, { signatureId, evidencePath });
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status = error.code === "TASK_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    return signatureErrorResponse(error, "[API /api/mantenimiento/preventivo] POST");
  }
}

/** ¿Una tarea concreta exige firma? Expuesto para pruebas y para la UI de servidor. */
export function taskRequiresSignature(task: Pick<PreventiveTaskRecord, "isCritical" | "requiresSignature">): boolean {
  return task.requiresSignature || preventiveTaskRequiresSignature(task.isCritical);
}
