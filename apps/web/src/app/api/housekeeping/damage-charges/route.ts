import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  DamageChargeError,
  DamageChargesRepository,
  NotificationQueueService,
  ReservationsRepository,
  formatCC,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const damageRepo = new DamageChargesRepository();
const reservations = new ReservationsRepository();

/**
 * GET /api/housekeeping/damage-charges?tokenId=… — cargos por daños de una noche (F7 · T7.2).
 * POST /api/housekeeping/damage-charges — alta del cargo + notificación al huésped.
 *
 * El cargo **no exige firma on-chain** (D-C27): se audita off-chain. El alta crea la notificación con
 * su plazo de reclamación; si hay contacto de correo de la reserva se encola el aviso (cola única D-03)
 * y si no, queda disponible por el portal (`WEB`). Nunca se bloquea el alta porque falle el correo.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_KEEPER", "HOUSEKEEPER", "HOUSEKEEPING", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  const tokenId = request.nextUrl.searchParams.get("tokenId") ?? undefined;
  try {
    const notifications = await damageRepo.listNotifications({ tokenId });
    return NextResponse.json({ notifications });
  } catch (error: unknown) {
    console.error("[API /api/housekeeping/damage-charges] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron listar los cargos." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  let body: {
    roomId?: unknown;
    tokenId?: unknown;
    inspectionId?: unknown;
    concept?: unknown;
    damageDescription?: unknown;
    amountCents?: unknown;
    evidencePath?: unknown;
    channel?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const tokenId = typeof body.tokenId === "string" ? body.tokenId.trim() : "";
  const description = typeof body.damageDescription === "string" ? body.damageDescription.trim() : "";
  const amountCents = body.amountCents;
  if (!roomId || !tokenId || description.length === 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "roomId, tokenId y damageDescription son obligatorios." },
      { status: 400 },
    );
  }
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "amountCents debe ser un entero positivo en céntimos." },
      { status: 400 },
    );
  }

  try {
    const { damageCharge, notification } = await damageRepo.createChargeWithNotification({
      roomId,
      tokenId,
      inspectionId: typeof body.inspectionId === "string" ? body.inspectionId : null,
      reportedBy: auth.session.username,
      approvedBy: auth.session.username,
      actorRole: auth.session.role,
      damageDescription: description.slice(0, 1000),
      evidencePath: typeof body.evidencePath === "string" ? body.evidencePath.trim().slice(0, 500) : null,
      amountCents,
      concept: typeof body.concept === "string" ? body.concept : undefined,
    });

    // Notificación al huésped (T7.3): correo si la reserva tiene contacto; si no, portal WEB.
    let channel: "EMAIL" | "WEB" = "WEB";
    try {
      const reservationId = await reservations.findReservationIdByToken(tokenId);
      const contact = reservationId ? await reservations.getContact(reservationId) : null;
      if (contact && contact.channel === "EMAIL" && contact.value.includes("@")) {
        const queue = new NotificationQueueService();
        await queue.enqueueNotification("DAMAGE_CHARGE_NOTICE", contact.value, {
          notificationId: notification.id,
          roomNumber: null,
          concept: typeof body.concept === "string" ? body.concept : "Daños en la habitación",
          amountCents,
          amountFormatted: formatCC(BigInt(amountCents) * 10n ** 16n),
          currency: "EUR",
          description,
          dueDate: new Date(notification.dueDate).toISOString(),
          claimUrl: `/mis-noches/cargos/${notification.id}`,
        });
        channel = "EMAIL";
      }
    } catch (error: unknown) {
      console.warn("[damage-charges] no se pudo encolar el aviso al huésped:", error);
    }
    const sent = await damageRepo.markSent(notification.id).catch(() => null);

    return NextResponse.json(
      {
        charge: damageCharge,
        notification: sent ?? notification,
        channel,
        claimUrl: `/mis-noches/cargos/${notification.id}`,
        signatureId: null,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof DamageChargeError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    console.error("[API /api/housekeeping/damage-charges] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar el cargo." }, { status: 500 });
  }
}
