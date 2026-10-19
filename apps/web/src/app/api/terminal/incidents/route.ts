import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MAINTENANCE_KINDS, MaintenanceError, MaintenanceRepository } from "@hotel/shared";
import {
  TERMINAL_TOKEN_COOKIE,
  readTerminalSession,
  terminalCookieOptions,
} from "@/lib/terminal-session";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * POST /api/terminal/incidents — el técnico reporta una avería desde el terminal (F5 · T5.2, D-C36).
 *
 * La incidencia nace `OPEN` para que la clasifique el jefe; no se permite escribir importes ni
 * datos de huéspedes (D-C35). `reported_by_role` deja la traza del operario de terminal.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await readTerminalSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: "TERMINAL_UNAUTHORIZED", message: session.message }, { status: 401 });
  }
  let body: { roomId?: unknown; kind?: unknown; description?: unknown; blocksSale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!roomId || !(MAINTENANCE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "roomId y un tipo de avería válido son obligatorios." },
      { status: 400 },
    );
  }
  try {
    const incident = await repo.reportIncident({
      roomId,
      kind,
      description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : null,
      blocksSale: body.blocksSale !== false,
      reportedBy: session.session.fullName,
      reportedByRole: session.session.role,
    });
    const response = NextResponse.json(
      { incident: { id: incident.id, kind: incident.kind, status: incident.status, roomNumber: incident.roomNumber } },
      { status: 201 },
    );
    response.cookies.set(TERMINAL_TOKEN_COOKIE, session.refreshedToken, terminalCookieOptions());
    return response;
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    console.error("[API /api/terminal/incidents] POST:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo reportar la incidencia." },
      { status: 500 },
    );
  }
}
