import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository } from "@hotel/shared";
import { assertSignatureAuthorizes, buildMaintenancePayload, isUuid } from "@/lib/mantenimiento/signatures";
import { blockErrorResponse } from "@/lib/mantenimiento/errors";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const maintenance = new MaintenanceRepository();

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/mantenimiento/rooms/[id]/block — bloquea una habitación con firma EIP-712 (F4 · T4.4/T4.5).
 *
 * Cuerpo: `{ signatureId, incidentId?, reason?, until? }`.
 *
 * La firma debe estar `SIGNED`, ser de esta habitación y corresponder **exactamente** a este payload
 * (habitación/motivo/fecha). El estado off-chain se aplica aquí (`publication_status = 'MAINTENANCE'`)
 * y el worker anclará después la operación con el relayer (F3); si el anclaje falla, la entidad queda
 * pendiente y la UI lo mostrará (T4.3).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "El id de habitación no es un UUID válido." }, { status: 400 });
  }

  let body: { signatureId?: unknown; incidentId?: unknown; reason?: unknown; until?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.signatureId !== "string" || !isUuid(body.signatureId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signatureId no es un UUID válido." }, { status: 400 });
  }
  const incidentId = body.incidentId === null || body.incidentId === undefined ? null : body.incidentId;
  if (incidentId !== null && !isUuid(incidentId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "incidentId no es un UUID válido." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : null;
  const until = typeof body.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.until) ? body.until : null;

  try {
    const payload = buildMaintenancePayload("ROOM_BLOCK", { roomId: id, incidentId, reason, until });
    await assertSignatureAuthorizes({
      signatureId: body.signatureId,
      action: "ROOM_BLOCK",
      entityUuid: id,
      payload,
    });
    const block = await maintenance.blockRoomWithSignature({
      roomId: id,
      signatureId: body.signatureId,
      actor: auth.session.username,
      incidentId,
      reason,
      until,
    });
    return NextResponse.json({ block }, { status: 200 });
  } catch (error: unknown) {
    return blockErrorResponse(error, "[API /api/mantenimiento/rooms/[id]/block] POST");
  }
}

