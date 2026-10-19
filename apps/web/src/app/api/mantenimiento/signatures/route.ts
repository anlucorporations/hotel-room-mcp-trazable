import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildMaintenancePayload, isAddress, isUuid, prepareMaintenanceSignature, type MaintenanceSignatureAction } from "@/lib/mantenimiento/signatures";
import { signatureErrorResponse } from "@/lib/mantenimiento/errors";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const ACTIONS = ["ROOM_BLOCK", "ROOM_UNBLOCK", "PREVENTIVE_TASK", "INSPECTION"] as const;

/**
 * POST /api/mantenimiento/signatures — prepara una firma EIP-712 de mantenimiento (F4 · T4.5).
 *
 * Cuerpo:
 * ```json
 * { "action": "ROOM_BLOCK", "roomId": "<uuid>", "incidentId": "<uuid>", "reason": "…",
 *   "until": "2026-10-25", "signerAddress": "0x…" }
 * ```
 * Devuelve `{ signatureId, contentHash, nonce, deadline, typedData }`; la wallet del jefe firma el
 * `typedData` y el cliente lo confirma en `PATCH /api/mantenimiento/signatures/[id]`.
 *
 * Solo `HEAD_MAINTENANCE` (o el owner, para preparar la firma del jefe) y solo con la wallet activa
 * asignada al rol. Si falta `HOTEL_OPERATIONS_CONTRACT_ADDRESS` → **503** (no se inventa dominio).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  let body: {
    action?: unknown;
    roomId?: unknown;
    incidentId?: unknown;
    taskId?: unknown;
    reason?: unknown;
    until?: unknown;
    signerAddress?: unknown;
    inspectionType?: unknown;
    result?: unknown;
    observations?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }

  if (typeof body.action !== "string" || !(ACTIONS as readonly string[]).includes(body.action)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: `action debe ser ${ACTIONS.join(", ")}.` },
      { status: 400 },
    );
  }
  const action = body.action as MaintenanceSignatureAction;
  // Coherencia rol ↔ acción (F6): la inspección la firma el ama (`HEAD_KEEPER`); el resto, el jefe de
  // mantenimiento. El owner puede preparar ambas cosas por ser respaldo.
  if (
    auth.session.role !== "DEFAULT_ADMIN_ROLE" &&
    ((action === "INSPECTION" && auth.session.role !== "HEAD_KEEPER") ||
      (action !== "INSPECTION" && auth.session.role !== "HEAD_MAINTENANCE"))
  ) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "El rol de la sesión no puede firmar esta acción." },
      { status: 403 },
    );
  }
  if (!isAddress(body.signerAddress)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signerAddress no es una dirección válida." }, { status: 400 });
  }
  // La inspección se firma contra la HABITACIÓN (el registro de inspección se crea después y se
  // enlaza con `signature_id`); preventivo contra la tarea; bloqueo/desbloqueo contra la habitación.
  const entityUuid =
    action === "PREVENTIVE_TASK" ? body.taskId : body.roomId;
  if (!isUuid(entityUuid)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: action === "PREVENTIVE_TASK" ? "taskId no es un UUID válido." : "roomId no es un UUID válido." },
      { status: 400 },
    );
  }
  const incidentId = body.incidentId === null || body.incidentId === undefined ? null : body.incidentId;
  if (incidentId !== null && !isUuid(incidentId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "incidentId no es un UUID válido." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : null;
  const until = typeof body.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.until) ? body.until : null;
  const inspectionType = typeof body.inspectionType === "string" ? body.inspectionType : null;
  const result = typeof body.result === "string" ? body.result : null;
  const observations = typeof body.observations === "string" ? body.observations.trim().slice(0, 500) : null;

  try {
    const prepared = await prepareMaintenanceSignature({
      action,
      entityUuid,
      payload: buildMaintenancePayload(action, {
        roomId: action === "PREVENTIVE_TASK" ? undefined : entityUuid,
        incidentId,
        reason,
        until,
        taskId: action === "PREVENTIVE_TASK" ? entityUuid : undefined,
        inspectionType,
        result,
        observations,
      }),
      signerAddress: body.signerAddress,
      username: auth.session.username,
      sessionRole: auth.session.role,
    });
    return NextResponse.json(prepared, { status: 201 });
  } catch (error: unknown) {
    return signatureErrorResponse(error, "[API /api/mantenimiento/signatures] POST");
  }
}

