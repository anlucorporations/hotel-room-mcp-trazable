import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_PRIORITIES,
  MaintenanceError,
  MaintenanceRepository,
  type MaintenancePriority,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/incidents — incidencias para el técnico (D-63).
 *   `?status=OPEN|IN_PROGRESS|RESOLVED|CANCELLED` · `?roomId=…` · `?mine=1` (asignadas a la sesión).
 * POST /api/mantenimiento/incidents — **reporta** una avería (D-52).
 *
 * Reportar lo hacen **recepción y limpieza** (D-52); el técnico las ve y las resuelve. El owner
 * entra en todo. La incidencia nace `OPEN` y, salvo `blocksSale: false`, **retira la habitación de la
 * venta** hasta que se resuelva (D-53).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "MAINTENANCE");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") ?? undefined;
  try {
    const incidents = await repo.listIncidents({
      status: status as never,
      roomId: params.get("roomId") ?? undefined,
      assignedTo: params.get("mine") === "1" ? auth.session.username : undefined,
    });
    return NextResponse.json({ incidents });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/incidents] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las incidencias." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["RECEPTION_ROLE", "HOUSEKEEPING", "MAINTENANCE"]);
  if (!auth.ok) return auth.response;

  let body: {
    roomId?: unknown;
    kind?: unknown;
    description?: unknown;
    priority?: unknown;
    blocksSale?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  if (typeof body.roomId !== "string" || body.roomId.length === 0) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Falta roomId." }, { status: 400 });
  }
  if (typeof body.kind !== "string" || !(MAINTENANCE_KINDS as readonly string[]).includes(body.kind)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: `kind debe ser uno de: ${MAINTENANCE_KINDS.join(", ")}.` },
      { status: 400 },
    );
  }
  const priority =
    typeof body.priority === "string" && (MAINTENANCE_PRIORITIES as readonly string[]).includes(body.priority)
      ? (body.priority as MaintenancePriority)
      : "MEDIUM";

  try {
    const incident = await repo.reportIncident({
      roomId: body.roomId,
      kind: body.kind,
      description: typeof body.description === "string" ? body.description : null,
      priority,
      blocksSale: body.blocksSale !== false,
      reportedBy: auth.session.username,
    });
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof MaintenanceError) {
      const status = error.code === "ROOM_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/mantenimiento/incidents] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar la incidencia." }, { status: 500 });
  }
}
