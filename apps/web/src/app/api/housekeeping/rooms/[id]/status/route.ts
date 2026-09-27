import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HousekeepingError, HousekeepingRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();

const OPERATIONAL_STATUSES = ["CLEAN", "DIRTY", "OCCUPIED"] as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/housekeeping/rooms/[id]/status — cambia el estado operativo de una habitación (D-19).
 *
 * Cuerpo: `{ status: "CLEAN" | "DIRTY" | "OCCUPIED", assignmentId? }`. Es lo que usan limpieza y
 * recepción: al hacer el check-out la habitación pasa a `DIRTY`; al limpiarla, a `CLEAN`. Cada
 * cambio deja traza en `housekeeping_room_logs` con el valor anterior real. Rol `HOUSEKEEPING`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, "HOUSEKEEPING");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { status?: unknown; assignmentId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  const status = body.status;
  if (typeof status !== "string" || !(OPERATIONAL_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "status debe ser CLEAN, DIRTY u OCCUPIED." },
      { status: 400 },
    );
  }
  const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId : null;

  try {
    const room = await repo.setRoomOperationalStatus(id, status, auth.session.username, assignmentId);
    return NextResponse.json({ room });
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
    }
    console.error("[API /api/housekeeping/rooms/[id]/status] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo cambiar el estado." }, { status: 500 });
  }
}
