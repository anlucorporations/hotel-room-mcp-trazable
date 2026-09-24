import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { WebPushService, NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const webPushService = new WebPushService(nftsRepo);

/**
 * POST /api/push/unsubscribe
 * DELETE /api/push/unsubscribe
 *
 * Baja inmediata (opt-out) de notificaciones Web Push (US-18).
 * Body: { endpoint: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleUnsubscribe(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return handleUnsubscribe(request);
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.endpoint) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Endpoint requerido para cancelar suscripción" },
        { status: 400 },
      );
    }

    await webPushService.unsubscribe(body.endpoint);

    return NextResponse.json({
      status: "UNSUBSCRIBED",
      message: "Suscripción a notificaciones cancelada exitosamente",
    });
  } catch (error) {
    console.error("[API /api/push/unsubscribe] Error:", error);
    return NextResponse.json(
      {
        error: "UNSUBSCRIBE_FAILED",
        message:
          error instanceof Error && error.message ? error.message : "Error al cancelar suscripción push",
      },
      { status: 500 },
    );
  }
}
