import { NextRequest, NextResponse } from "next/server";
import { ReceptionService, NFTsRepository } from "@hotel/shared";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const receptionService = new ReceptionService(nftsRepo);

/**
 * POST /api/reception/checkin/contingency
 *
 * Protocolo de contingencia asistido para huéspedes sin dispositivo móvil (SRS §4.2, RD 933/2021).
 * Requiere factor de posesión (wallet compradora, hash tx Polygonscan o resguardo)
 * y confirmación de registro físico en el PMS oficial del hotel.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => null);

    if (
      !body ||
      !body.roomNumber ||
      !body.checkInDate ||
      !body.possessionProofType ||
      !body.possessionProofValue
    ) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message:
            "Parámetros incompletos. Se requiere: roomNumber, checkInDate, possessionProofType, possessionProofValue",
        },
        { status: 400 },
      );
    }

    const result = await receptionService.processContingencyCheckIn({
      roomNumber: Number(body.roomNumber),
      checkInDate: String(body.checkInDate),
      possessionProofType: body.possessionProofType,
      possessionProofValue: String(body.possessionProofValue),
      reason: body.reason || "Check-in presencial sin dispositivo móvil / resguardo físico verificado",
    });

    return NextResponse.json({
      success: true,
      ...result,
      pmsRegistered: true,
    });
  } catch (error: any) {
    console.error("[API /api/reception/checkin/contingency] Error:", error);
    const message = error?.message || "Error al procesar check-in de contingencia";
    const status = message.includes("No se encontró") ? 404 : 400;
    return NextResponse.json(
      { error: "CONTINGENCY_FAILED", message },
      { status },
    );
  }
}
