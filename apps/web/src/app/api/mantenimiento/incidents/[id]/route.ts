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
 * PATCH /api/mantenimiento/incidents/[id] — avanza una incidencia (D-52/D-53).
 *
 * Cuerpo: `{ action: "assign" | "resolve" | "cancel", assignedTo?, notes? }`.
 * Solo el técnico (`MAINTENANCE`) o el owner. **Resolver** o **cancelar** libera la habitación de
 * forma automática: el bloqueo de venta existe mientras hay una incidencia abierta (D-53).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "MAINTENANCE");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { action?: unknown; assignedTo?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes : null;
  try {
    switch (body.action) {
      case "assign": {
        const assignedTo = typeof body.assignedTo === "string" && body.assignedTo.trim().length > 0
          ? body.assignedTo.trim()
          : auth.session.username;
        const incident = await repo.assignIncident(id, assignedTo, auth.session.username, notes);
        return notFoundOr(incident);
      }
      case "resolve": {
        const incident = await repo.resolveIncident(id, auth.session.username, notes);
        return notFoundOr(incident);
      }
      case "cancel": {
        const incident = await repo.cancelIncident(id, auth.session.username, notes);
        return notFoundOr(incident);
      }
      default:
        return NextResponse.json(
          { error: "BAD_REQUEST", message: "action debe ser 'assign', 'resolve' o 'cancel'." },
          { status: 400 },
        );
    }
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status = error.code === "INCIDENT_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/mantenimiento/incidents/[id]] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la incidencia." }, { status: 500 });
  }
}

function notFoundOr(incident: unknown): NextResponse {
  if (incident === null) {
    return NextResponse.json({ error: "INCIDENT_NOT_FOUND", message: "La incidencia no existe." }, { status: 404 });
  }
  return NextResponse.json({ incident });
}
