import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { CONTINGENCY_REASONS, type ContingencyReason, type PossessionProofType } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { checkInErrorResponse, receptionService } from "../route";

export const dynamic = "force-dynamic";

const ALLOWED_PROOF_TYPES: readonly PossessionProofType[] = [
  "WALLET_ADDRESS",
  "TX_HASH",
  "VOUCHER_CODE",
];

/** Motivo por defecto cuando el mostrador no lo indica (vocabulario cerrado, sin texto libre). */
const DEFAULT_REASON: ContingencyReason = "SIN_DISPOSITIVO";

/**
 * POST /api/reception/checkin/contingency
 *
 * Protocolo de contingencia asistido para huéspedes sin dispositivo móvil (SRS §4.2).
 *
 * Sin PII (D-13/D-14): la prueba de posesión admite **solo** una dirección de wallet, un hash de
 * transacción o un código de resguardo. El registro de viajeros del RD 933/2021 lo cumplimenta el
 * hotel en su PMS, no esta plataforma: el servidor rechaza documentos de identidad y cualquier
 * texto libre (la validación vive en `ReceptionService.validatePossessionProof`).
 *
 * El check-in se ancla on-chain **igual que el del QR**: la contingencia cambia cómo se acredita la
 * posesión, no la garantía (D-05).
 *
 * Protegida (D-04): exige sesión de `RECEPTION_ROLE`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

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

    if (!ALLOWED_PROOF_TYPES.includes(body.possessionProofType)) {
      return NextResponse.json(
        {
          error: "PRUEBA_POSESION_INVALIDA",
          message: `Tipo de prueba de posesión no admitido. Valores válidos: ${ALLOWED_PROOF_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const reason = (body.reason ?? DEFAULT_REASON) as ContingencyReason;
    if (!CONTINGENCY_REASONS.includes(reason)) {
      return NextResponse.json(
        {
          error: "MOTIVO_INVALIDO",
          message: `Motivo de contingencia no admitido. Valores válidos: ${CONTINGENCY_REASONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const result = await receptionService().processContingencyCheckIn({
      roomNumber: Number(body.roomNumber),
      checkInDate: String(body.checkInDate),
      possessionProofType: body.possessionProofType,
      possessionProofValue: String(body.possessionProofValue),
      reason,
    });

    return NextResponse.json({
      success: true,
      ...result,
      processedBy: auth.session.username,
    });
  } catch (error: unknown) {
    return checkInErrorResponse("checkin/contingency", error);
  }
}
