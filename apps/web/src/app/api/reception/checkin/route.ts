import { NextRequest, NextResponse } from "next/server";
import { ReceptionService, NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const receptionService = new ReceptionService(nftsRepo);

/**
 * POST /api/reception/checkin
 *
 * Validación optimista en recepción (< 500ms, SLA RNF-03) mediante ticket JWS (US-14).
 * Body JSON: { ticketJws: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.ticketJws) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "ticketJws requerido para check-in" },
        { status: 400 },
      );
    }

    const result = await receptionService.processTicketCheckIn(body.ticketJws);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[API /api/reception/checkin] Error:", error);
    const message = error?.message || "Error al procesar check-in";
    const status = message.includes("no encontrado") ? 404 : 400;
    return NextResponse.json(
      { error: "CHECKIN_FAILED", message },
      { status },
    );
  }
}
