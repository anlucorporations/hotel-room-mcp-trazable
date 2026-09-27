import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingError, HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { defaultBoardDate, isIsoDate } from "@/lib/housekeeping-board";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

/**
 * GET /api/housekeeping/assignments?date=AAAA-MM-DD&shiftId=… — reparto del día o de un turno.
 * POST /api/housekeeping/assignments — reparto automático `{ shiftId, assignees[] }` (D-48)
 *      o ajuste manual `{ shiftId, roomId, assignee }`.
 * DELETE /api/housekeeping/assignments?shiftId=…&roomId=… — retira una habitación del reparto.
 *
 * Rol `HOUSEKEEPING` (owner incluido). El ajuste manual es del supervisor; el reparto automático
 * reparte por ocupación rotando entre las camareras y no pisa lo ya asignado.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const shiftId = params.get("shiftId");
  const date = params.get("date") ?? defaultBoardDate();
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Fecha no válida (AAAA-MM-DD)." }, { status: 400 });
  }
  try {
    const assignments = shiftId
      ? await repo.listAssignments(shiftId)
      : await repo.listAssignmentsByDate(date);
    return NextResponse.json({ assignments });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/assignments] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el reparto." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  let body: { shiftId?: unknown; assignees?: unknown; roomId?: unknown; assignee?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const shiftId = typeof body.shiftId === "string" ? body.shiftId : "";
  if (!shiftId) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Falta shiftId." }, { status: 400 });
  }

  try {
    // Ajuste manual: una habitación concreta para una persona.
    if (typeof body.roomId === "string" && typeof body.assignee === "string") {
      const assignment = await repo.assignRoom({ shiftId, roomId: body.roomId, assignee: body.assignee });
      return NextResponse.json({ assignment }, { status: 201 });
    }

    // Reparto automático por ocupación (D-48).
    const assignees = Array.isArray(body.assignees)
      ? body.assignees.filter((name): name is string => typeof name === "string")
      : [];
    const assignments = await repo.autoAssign(shiftId, assignees);
    return NextResponse.json({ assignments });
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      const status = error.code === "SHIFT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/housekeeping/assignments] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo repartir el servicio." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const shiftId = params.get("shiftId");
  const roomId = params.get("roomId");
  if (!shiftId || !roomId) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Se requieren shiftId y roomId." }, { status: 400 });
  }
  try {
    const removed = await repo.unassignRoom(shiftId, roomId);
    return NextResponse.json({ removed });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/assignments] DELETE:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo retirar la habitación." }, { status: 500 });
  }
}
