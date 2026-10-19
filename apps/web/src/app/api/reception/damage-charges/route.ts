import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DamageChargeError, DamageChargesRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const repo = new DamageChargesRepository();

/**
 * GET /api/reception/damage-charges — reclamaciones y avisos de daños para recepción (F7 · T7.5).
 * PATCH /api/reception/damage-charges — resuelve una reclamación `{ notificationId, accepted }`.
 *
 * Aceptar deja el cargo `PENDING` para cobrarlo en el folio del check-out; rechazar lo cancela
 * (D-C11). Solo se resuelven reclamaciones (`DISPUTED`) o avisos vencidos (`EXPIRED`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["RECEPTION_ROLE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  const tokenId = request.nextUrl.searchParams.get("tokenId") ?? undefined;
  try {
    await repo.expireOverdueNotifications();
    const notifications = await repo.listNotifications({
      tokenId,
      statuses: ["SENT", "DISPUTED", "EXPIRED", "PENDING"],
    });
    return NextResponse.json({ notifications });
  } catch (error: unknown) {
    console.error("[API /api/reception/damage-charges] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudieron leer las reclamaciones." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, ["RECEPTION_ROLE", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  let body: { notificationId?: unknown; accepted?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.notificationId !== "string" || typeof body.accepted !== "boolean") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "notificationId y accepted (boolean) son obligatorios." },
      { status: 400 },
    );
  }
  try {
    const result = await repo.resolveNotification({
      id: body.notificationId,
      accepted: body.accepted,
      resolvedBy: auth.session.username,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof DamageChargeError) {
      const status = error.code === "NOTIFICATION_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/reception/damage-charges] PATCH:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo resolver la reclamación." }, { status: 500 });
  }
}
