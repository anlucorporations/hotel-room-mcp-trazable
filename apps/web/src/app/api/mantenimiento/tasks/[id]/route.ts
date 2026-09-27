import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceError, MaintenanceRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/mantenimiento/tasks/[id] — cierra una tarea preventiva (D-54).
 *
 * Cuerpo: `{ action: "complete" | "skip", notes? }`. Al cerrarla, el sistema **programa la
 * siguiente** según la periodicidad y registra **quién y cuándo** (D-54). Rol `MAINTENANCE`.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "MAINTENANCE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { action?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const notes = typeof body.notes === "string" ? body.notes : null;

  try {
    if (body.action === "complete") {
      return NextResponse.json(await repo.completeTask(id, auth.session.username, notes));
    }
    if (body.action === "skip") {
      return NextResponse.json(await repo.skipTask(id, auth.session.username, notes));
    }
    return NextResponse.json({ error: "BAD_REQUEST", message: "action debe ser 'complete' o 'skip'." }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status = error.code === "TASK_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/mantenimiento/tasks/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo cerrar la tarea." }, { status: 500 });
  }
}
