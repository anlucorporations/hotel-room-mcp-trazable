import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  HousekeepingError,
  HousekeepingRepository,
  INSPECTION_REQUIRES_SIGNATURE_KEY,
  SettingsRepository,
  buildRoomStateBoard,
  inspectionEffects,
  requiresInspectionSignature,
  type InspectionResult,
  type InspectionType,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { assertSignatureAuthorizes, buildMaintenancePayload, isUuid } from "@/lib/mantenimiento/signatures";
import { signatureErrorResponse } from "@/lib/mantenimiento/errors";

export const dynamic = "force-dynamic";

const repo = new HousekeepingRepository();
const settings = new SettingsRepository();

const INSPECTION_TYPES = ["CHECKOUT", "DAILY_SERVICE"] as const;
const INSPECTION_RESULTS = ["APPROVED", "REJECTED"] as const;
/**
 * GET /api/housekeeping/inspections — inspecciones (F6 · T6.3/T6.4).
 *
 * Devuelve el listado filtrable y el **flag vigente** `inspection_requires_signature`, que la UI usa
 * para saber si debe pedir firma (D-C23: por defecto `false`). Acceso: personal de la suite.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HOUSEKEEPING", "HOUSEKEEPER", "HEAD_KEEPER"]);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const roomId = params.get("roomId") ?? undefined;
  const result = params.get("result");
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  try {
    const [inspections, flag] = await Promise.all([
      repo.listInspections({
        roomId,
        result:
          result !== null && (INSPECTION_RESULTS as readonly string[]).includes(result)
            ? (result as InspectionResult)
            : undefined,
        from,
        to,
      }),
      settings.get(INSPECTION_REQUIRES_SIGNATURE_KEY).catch(() => null),
    ]);
    return NextResponse.json({
      inspections,
      signatureRequired: requiresInspectionSignature(flag),
    });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/inspections] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar las inspecciones." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/housekeeping/inspections — registra y aplica una inspección (F6 · T6.4/T6.6).
 *
 * Cuerpo: `{ roomId, assignmentId?, inspectionType, result, observations?, signatureId? }`.
 *
 * - Con `INSPECTION_REQUIRES_SIGNATURE` activo, la firma EIP-712 (`INSPECTION`, rol `HEAD_KEEPER`) es
 *   **obligatoria** y debe autorizar exactamente esta habitación, tipo y resultado.
 * - `APPROVED` deja la habitación `CLEAN`; `REJECTED` la deja `DIRTY` y devuelve la asignación a
 *   `PENDING` (retrabajo). **No se toca `publication_status`** (D-C9: inspeccionar no libera venta).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  let body: {
    roomId?: unknown;
    assignmentId?: unknown;
    inspectionType?: unknown;
    result?: unknown;
    observations?: unknown;
    signatureId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (!isUuid(body.roomId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "roomId no es un UUID válido." }, { status: 400 });
  }
  const assignmentId = body.assignmentId === null || body.assignmentId === undefined ? null : body.assignmentId;
  if (assignmentId !== null && !isUuid(assignmentId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "assignmentId no es un UUID válido." }, { status: 400 });
  }
  if (typeof body.inspectionType !== "string" || !(INSPECTION_TYPES as readonly string[]).includes(body.inspectionType)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: `inspectionType debe ser ${INSPECTION_TYPES.join(" o ")}.` },
      { status: 400 },
    );
  }
  if (typeof body.result !== "string" || !(INSPECTION_RESULTS as readonly string[]).includes(body.result)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: `result debe ser ${INSPECTION_RESULTS.join(" o ")}.` },
      { status: 400 },
    );
  }
  const inspectionType = body.inspectionType as InspectionType;
  const result = body.result as InspectionResult;
  const observations = typeof body.observations === "string" ? body.observations.trim().slice(0, 500) : null;
  const signatureId = body.signatureId === undefined || body.signatureId === null ? null : body.signatureId;
  if (signatureId !== null && !isUuid(signatureId)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signatureId no es un UUID válido." }, { status: 400 });
  }

  try {
    const flag = await settings.get(INSPECTION_REQUIRES_SIGNATURE_KEY).catch(() => null);
    const signatureRequired = requiresInspectionSignature(flag);
    if (signatureRequired && !signatureId) {
      return NextResponse.json(
        {
          error: "SIGNATURE_REQUIRED",
          message: "La certificación de inspección exige firma EIP-712 (flag del hotel activo).",
        },
        { status: 409 },
      );
    }
    if (signatureId) {
      await assertSignatureAuthorizes({
        signatureId,
        action: "INSPECTION",
        entityUuid: body.roomId,
        payload: buildMaintenancePayload("INSPECTION", {
          roomId: body.roomId,
          inspectionType,
          result,
          observations,
        }),
      });
    }
    const inspection = await repo.createInspection({
      roomId: body.roomId,
      assignmentId,
      inspectedBy: auth.session.username,
      inspectionType,
      result,
      observations,
      signatureId,
    });
    // Efecto sobre la habitación/asignación (D-C9: la publicación NO cambia).
    await repo.applyInspectionToRoom({
      roomId: body.roomId,
      result,
      assignmentId,
    });
    const effects = inspectionEffects(result);
    return NextResponse.json(
      { inspection, signatureRequired, roomOperationalStatus: effects.roomOperationalStatus },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof HousekeepingError) {
      const status = error.code === "ROOM_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    return signatureErrorResponse(error, "[API /api/housekeeping/inspections] POST");
  }
}

/** Reexport para pruebas del plan (tablero de estados sin BD). */
export { buildRoomStateBoard };
