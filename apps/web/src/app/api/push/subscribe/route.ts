import { NextRequest, NextResponse } from "next/server";
import { WebPushService, NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const webPushService = new WebPushService(nftsRepo);

/**
 * POST /api/push/subscribe
 *
 * Registro anónimo opt-in para notificaciones Web Push (LSSI-CE art. 21, US-18).
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.endpoint || !body.keys || !body.keys.p256dh || !body.keys.auth) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Payload de suscripción push incompleto" },
        { status: 400 },
      );
    }

    await webPushService.subscribe(body.endpoint, body.keys.p256dh, body.keys.auth);

    return NextResponse.json({
      status: "SUBSCRIBED",
      message: "Suscripción a notificaciones Web Push registrada exitosamente",
    });
  } catch (error: any) {
    console.error("[API /api/push/subscribe] Error:", error);
    return NextResponse.json(
      { error: "SUBSCRIPTION_FAILED", message: error?.message || "Error al registrar suscripción push" },
      { status: 500 },
    );
  }
}
