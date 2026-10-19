import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceError, MaintenanceRepository, RoomsRepository } from "@hotel/shared";
import {
  TERMINAL_TOKEN_COOKIE,
  readTerminalSession,
  terminalCookieOptions,
} from "@/lib/terminal-session";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();
const roomsRepo = new RoomsRepository();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** DTO del terminal: **sin importes, huéspedes ni configuración** (D-C35, RNF-M-20). */
function incidentDto(incident: Awaited<ReturnType<MaintenanceRepository["listIncidents"]>>[number]) {
  return {
    id: incident.id,
    kind: incident.kind,
    description: incident.description,
    priority: incident.priority,
    status: incident.status,
    roomNumber: incident.roomNumber,
    blocksSale: incident.blocksSale,
    assignedTo: incident.assignedTo,
    createdAt: incident.createdAt,
  };
}

function taskDto(task: Awaited<ReturnType<MaintenanceRepository["listTasks"]>>[number]) {
  return {
    id: task.id,
    dueDate: task.dueDate,
    status: task.status,
    overdue: task.overdue,
    planName: task.planName,
    equipment: task.equipment,
    roomNumber: task.roomNumber,
    areaName: task.areaName,
    requiresSignature: task.requiresSignature,
    assignedTo: task.assignedTo,
    validationStatus: task.validationStatus,
    updatedAt: task.updatedAt,
  };
}

/**
 * GET /api/terminal/tasks — tablero del técnico (F5 · T5.2/T5.5): **solo lo asignado**.
 * PATCH /api/terminal/tasks — avance y cierre con evidencia.
 *
 * Cierre de tarea desde terminal → `PENDING_VERIFICATION` (CU-V-14). Si la tarea exige firma
 * (área crítica), el terminal **no puede cerrarla**: se cierra desde la suite del jefe.
 * El cierre incluye bloqueo optimista por `updatedAt` (T5.5).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await readTerminalSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: "TERMINAL_UNAUTHORIZED", message: session.message }, { status: 401 });
  }
  try {
    const [board, rooms] = await Promise.all([
      repo.listTerminalTasks(session.session.username, today()),
      roomsRepo.listRooms(),
    ]);
    const response = NextResponse.json({
      operator: session.session,
      incidents: board.incidents.map(incidentDto),
      tasks: board.tasks.map(taskDto),
      // Solo número e id: el terminal no necesita más datos de la habitación (D-C35).
      rooms: rooms.map((room) => ({ id: room.id, roomNumber: room.roomNumber })),
      generatedAt: new Date().toISOString(),
    });
    response.cookies.set(TERMINAL_TOKEN_COOKIE, session.refreshedToken, terminalCookieOptions());
    return response;
  } catch (error: unknown) {
    console.error("[API /api/terminal/tasks] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el tablero del terminal." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await readTerminalSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: "TERMINAL_UNAUTHORIZED", message: session.message }, { status: 401 });
  }
  let body: {
    kind?: unknown;
    id?: unknown;
    action?: unknown;
    notes?: unknown;
    evidencePath?: unknown;
    expectedUpdatedAt?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const kind = body.kind;
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if ((kind !== "task" && kind !== "incident") || id.length === 0 || action.length === 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "kind ('task'|'incident'), id y action son obligatorios." },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : null;
  const evidencePath =
    typeof body.evidencePath === "string" ? body.evidencePath.trim().slice(0, 500) : null;
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;

  try {
    if (kind === "task") {
      if (action !== "close") {
        return NextResponse.json({ error: "BAD_REQUEST", message: "Acción de tarea no admitida." }, { status: 400 });
      }
      const task = await repo.findTask(id);
      if (!task) return NextResponse.json({ error: "TASK_NOT_FOUND", message: "La tarea no existe." }, { status: 404 });
      if (task.assignedTo !== session.session.username) {
        return NextResponse.json(
          { error: "FORBIDDEN", message: "La tarea no está asignada a este operario." },
          { status: 403 },
        );
      }
      if (task.requiresSignature) {
        return NextResponse.json(
          {
            error: "SIGNATURE_REQUIRED",
            message: "Tarea de área crítica: se cierra desde la suite del jefe con firma.",
          },
          { status: 409 },
        );
      }
      const result = await repo.completeTask(id, session.session.fullName, notes, {
        evidencePath,
        validationStatus: "PENDING_VERIFICATION",
        expectedUpdatedAt,
      });
      const response = NextResponse.json({
        task: taskDto(result.task),
        next: result.next ? taskDto(result.next) : null,
      });
      response.cookies.set(TERMINAL_TOKEN_COOKIE, session.refreshedToken, terminalCookieOptions());
      return response;
    }

    // kind === "incident": el terminal solo puede avanzar incidencias asignadas a él.
    const incident = (await repo.listIncidents({ openOnly: true })).find((row) => row.id === id);
    if (!incident) {
      return NextResponse.json({ error: "INCIDENT_NOT_FOUND", message: "La incidencia no existe o ya está cerrada." }, { status: 404 });
    }
    if (incident.assignedTo !== session.session.username) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "La incidencia no está asignada a este operario." },
        { status: 403 },
      );
    }
    const updated =
      action === "resolve"
        ? await repo.resolveIncident(id, session.session.fullName, notes)
        : action === "start"
          ? await repo.assignIncident(id, session.session.username, session.session.fullName, notes)
          : null;
    if (!updated) {
      return NextResponse.json({ error: "BAD_REQUEST", message: "Acción de incidencia no admitida." }, { status: 400 });
    }
    const response = NextResponse.json({ incident: incidentDto(updated) });
    response.cookies.set(TERMINAL_TOKEN_COOKIE, session.refreshedToken, terminalCookieOptions());
    return response;
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status =
        error.code === "OPTIMISTIC_LOCK_CONFLICT"
          ? 409
          : error.code === "TASK_NOT_FOUND" || error.code === "INCIDENT_NOT_FOUND"
            ? 404
            : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/terminal/tasks] PATCH:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo actualizar la tarea." },
      { status: 500 },
    );
  }
}
