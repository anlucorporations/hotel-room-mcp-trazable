import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  CHECKOUT_INCIDENT_KINDS,
  CHECKOUT_ROOM_CONDITIONS,
  ReceptionRepository,
  type CheckoutIncidentKind,
  type CheckoutRoomCondition,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { receptionErrorResponse } from "@/lib/reception-errors";

export const dynamic = "force-dynamic";

const repo = new ReceptionRepository();

function isRoomCondition(value: unknown): value is CheckoutRoomCondition {
  return (
    typeof value === "string" &&
    (CHECKOUT_ROOM_CONDITIONS as readonly string[]).includes(value)
  );
}

function isIncidentKind(value: unknown): value is CheckoutIncidentKind {
  return typeof value === "string" && (CHECKOUT_INCIDENT_KINDS as readonly string[]).includes(value);
}

/**
 * POST /api/reception/checkout
 *
 * Check-out de una estancia (RF-34/RF-34.1, CU-34): verifica la habitación, registra incidencias y
 * cancela los cargos adicionales marcados. Idempotente por `token_id` y solo para noches con la
 * entrada ya registrada. Body JSON:
 * `{ tokenId, roomCondition: "OK"|"INCIDENCIA", notes?, incidents?: [{kind, description?}], cancelChargeIds?: string[] }`
 *
 * 200 `{ checkout, created }` · 400 payload inválido · 404 reserva inexistente · 409 sin check-in
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as {
      tokenId?: unknown;
      roomCondition?: unknown;
      notes?: unknown;
      incidents?: unknown;
      cancelChargeIds?: unknown;
    } | null;

    if (!body || typeof body.tokenId !== "string" || body.tokenId.length === 0) {
      return NextResponse.json(
        { error: "CARGO_INVALIDO", message: "Falta el tokenId de la estancia." },
        { status: 400 },
      );
    }
    if (!isRoomCondition(body.roomCondition)) {
      return NextResponse.json(
        {
          error: "CARGO_INVALIDO",
          message: `roomCondition debe ser uno de: ${CHECKOUT_ROOM_CONDITIONS.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const rawIncidents = Array.isArray(body.incidents) ? body.incidents : [];
    const incidents: { kind: CheckoutIncidentKind; description?: string | null }[] = [];
    for (const item of rawIncidents) {
      const kind = (item as { kind?: unknown })?.kind;
      if (!isIncidentKind(kind)) {
        return NextResponse.json(
          { error: "CARGO_INVALIDO", message: "Tipo de incidencia no admitido." },
          { status: 400 },
        );
      }
      const description = (item as { description?: unknown }).description;
      incidents.push({ kind, description: typeof description === "string" ? description : null });
    }

    const cancelChargeIds = Array.isArray(body.cancelChargeIds)
      ? body.cancelChargeIds.filter((id): id is string => typeof id === "string")
      : [];

    const result = await repo.createCheckout({
      tokenId: body.tokenId,
      roomCondition: body.roomCondition,
      notes: typeof body.notes === "string" ? body.notes : null,
      incidents,
      cancelChargeIds,
      processedBy: auth.session.username,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return receptionErrorResponse("checkout", error);
  }
}
