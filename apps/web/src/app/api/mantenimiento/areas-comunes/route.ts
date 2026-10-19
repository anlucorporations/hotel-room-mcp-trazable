import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceError, MaintenanceRepository, type MaintenanceAreaRecord } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { MAINTENANCE_SUITE_ROLES } from "@/lib/mantenimiento/roles";
import { isUuid } from "@/lib/mantenimiento/signatures";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

interface AreaWithTasks extends MaintenanceAreaRecord {
  readonly tasks: Awaited<ReturnType<MaintenanceRepository["listAreaTasks"]>>;
}

/**
 * GET /api/mantenimiento/areas-comunes — áreas, sus tareas rutinarias y registros pendientes de
 * verificar (F4 · T4.4). Las áreas críticas exigen firma al verificar su ejecución (D-C23).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, [...MAINTENANCE_SUITE_ROLES]);
  if (!auth.ok) return auth.response;

  const areaId = request.nextUrl.searchParams.get("areaId") ?? undefined;
  try {
    const [allAreas, logs] = await Promise.all([
      repo.listAreas(),
      repo.listAreaLogs({ areaId, pendingVerification: true }),
    ]);
    const areas = areaId ? allAreas.filter((area) => area.id === areaId) : allAreas;
    const withTasks: AreaWithTasks[] = await Promise.all(
      areas.map(async (area) => ({ ...area, tasks: await repo.listAreaTasks(area.id) })),
    );
    return NextResponse.json({ areas: withTasks, pendingLogs: logs });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/areas-comunes] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron leer las áreas comunes." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mantenimiento/areas-comunes — registra la ejecución de una tarea rutinaria.
 * Cuerpo: `{ action: "log", taskId, notes?, evidencePath? }`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, [...MAINTENANCE_SUITE_ROLES]);
  if (!auth.ok) return auth.response;

  let body: { action?: unknown; taskId?: unknown; notes?: unknown; evidencePath?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (body.action !== "log") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "action debe ser 'log'." }, { status: 400 });
  }
  if (!isUuid(body.taskId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "taskId no es un UUID válido." }, { status: 400 });
  }
  try {
    const log = await repo.registerAreaLog({
      taskId: body.taskId,
      performedBy: auth.session.username,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : null,
      evidencePath: typeof body.evidencePath === "string" ? body.evidencePath.trim().slice(0, 500) : null,
    });
    return NextResponse.json({ log }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    console.error("[API /api/mantenimiento/areas-comunes] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar la ejecución." }, { status: 500 });
  }
}

/**
 * PATCH /api/mantenimiento/areas-comunes — verifica un registro pendiente.
 * Cuerpo: `{ action: "verify", logId, signatureId? }`. La firma es opcional y se enlaza si llega.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  let body: { action?: unknown; logId?: unknown; signatureId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (body.action !== "verify") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "action debe ser 'verify'." }, { status: 400 });
  }
  if (!isUuid(body.logId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "logId no es un UUID válido." }, { status: 400 });
  }
  const signatureId = body.signatureId === undefined || body.signatureId === null ? null : body.signatureId;
  if (signatureId !== null && !isUuid(signatureId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signatureId no es un UUID válido." }, { status: 400 });
  }
  try {
    const log = await repo.verifyAreaLog(body.logId, {
      verifiedBy: auth.session.username,
      signatureId,
    });
    return NextResponse.json({ log }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    console.error("[API /api/mantenimiento/areas-comunes] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo verificar el registro." }, { status: 500 });
  }
}
