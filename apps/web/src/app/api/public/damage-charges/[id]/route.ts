import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DamageChargeError, DamageChargesRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const repo = new DamageChargesRepository();

/**
 * Portal del huésped para un aviso de cargo por daños (F7 · T7.4).
 *
 * El enlace contiene el **UUID de la notificación** (capacidad no adivinable), de modo que el huésped
 * puede consultar y reclamar sin cuenta. La respuesta es mínima: importe, descripción, plazo y estado
 * (sin datos personales ni de otros huéspedes). Antes de responder se ejecuta la caducidad perezosa
 * de plazos vencidos, para no mostrar «reclamable» lo que ya expiró.
 *
 * GET  /api/public/damage-charges/[id]
 * POST /api/public/damage-charges/[id]  `{ action: "claim" | "acknowledge", notes? }`
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    await repo.expireOverdueNotifications();
    const view = await repo.findNotification(id);
    if (!view) {
      return NextResponse.json({ error: "NOTIFICATION_NOT_FOUND", message: "El aviso no existe." }, { status: 404 });
    }
    return NextResponse.json({
      id: view.id,
      status: view.status,
      dueDate: view.dueDate,
      claimable: view.status === "SENT" || view.status === "PENDING",
      amountCents: view.amountCents,
      currency: view.currency,
      concept: view.concept,
      description: view.damageDescription,
      roomNumber: view.roomNumber,
      evidenceAvailable: view.evidencePath !== null,
      disputedAt: view.disputedAt,
      resolvedAt: view.resolvedAt,
      resolvedAccepted: view.status === "RESOLVED_ACCEPTED",
    });
  } catch (error: unknown) {
    console.error("[API /api/public/damage-charges/[id]] GET:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo leer el aviso." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  let body: { action?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (body.action !== "claim" && body.action !== "acknowledge") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "action debe ser 'claim' o 'acknowledge'." },
      { status: 400 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null;
  try {
    const view =
      body.action === "claim"
        ? await repo.claimNotification(id, notes)
        : await repo.acknowledgeNotification(id);
    return NextResponse.json({ id: view.id, status: view.status, dueDate: view.dueDate });
  } catch (error: unknown) {
    if (error instanceof DamageChargeError) {
      const status = error.code === "NOTIFICATION_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    console.error("[API /api/public/damage-charges/[id]] POST:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "No se pudo registrar la respuesta." }, { status: 500 });
  }
}
