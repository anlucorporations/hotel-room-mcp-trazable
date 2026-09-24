import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CheckInError,
  NFTsRepository,
  NotificationQueueService,
  ReceptionService,
  type CheckInErrorCode,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { activeChain, contractAddress, rpcUrl } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

/**
 * HTTP por **código** de error de dominio (D-05). El texto puede cambiar; el código no, así que el
 * mapeo se hace por código y no buscando subcadenas en el mensaje.
 *
 *   409 = conflicto con el estado de la noche (ya consumida, resguardo ya usado, titularidad
 *         cambiada, sin venta primaria).
 *   502/503 = el ancla on-chain no se pudo ejecutar (RPC o wallet): el check-in NO se registra.
 */
const HTTP_BY_CODE: Record<CheckInErrorCode, number> = {
  TICKET_INVALIDO: 400,
  TICKET_YA_USADO: 409,
  TOKEN_NO_ENCONTRADO: 404,
  TITULARIDAD_CAMBIADA: 409,
  // La cadena no se pudo consultar: no se autoriza nada (503, no un 401/409 engañoso).
  TITULARIDAD_NO_VERIFICABLE: 503,
  YA_CONSUMIDA: 409,
  CHECKIN_EN_PROCESO: 409,
  TOKEN_QUEMADO: 410,
  NOCHE_NO_VENDIDA: 409,
  // Pausa del contrato: no es un fallo de anclaje (RPC/wallet), es una decisión del hotel (M7 · H4).
  CONTRATO_EN_PAUSA: 503,
  ANCLAJE_FALLIDO: 502,
  ANCLAJE_NO_CONFIGURADO: 503,
  PRUEBA_POSESION_INVALIDA: 400,
  PRUEBA_POSESION_CON_PII: 400,
  MOTIVO_INVALIDO: 400,
  RESERVA_NO_ENCONTRADA: 404,
};

/**
 * Servicio de recepción **único por proceso** (singleton deliberado).
 *
 * La hot-wallet de recepción firma los `markCheckedIn` y el servicio serializa esos envíos para
 * que dos check-ins simultáneos no colisionen en el `nonce`. Esa garantía solo existe si TODAS las
 * peticiones comparten la misma instancia: crear el servicio por request devolvería la colisión.
 */
let cachedService: ReceptionService | null = null;

export function receptionService(): ReceptionService {
  if (cachedService) return cachedService;

  const privateKey = process.env.RECEPTION_WALLET_PRIVATE_KEY;
  const publicClient = serverPublicClient();
  const walletClient = privateKey
    ? createWalletClient({
        account: privateKeyToAccount(privateKey as Hex),
        chain: activeChain,
        transport: http(process.env.RPC_URL ?? rpcUrl),
      })
    : null;

  cachedService = new ReceptionService(
    nftsRepo,
    new NotificationQueueService(),
    publicClient,
    walletClient,
    {
      nftContractAddress: contractAddress,
      receptionWalletAddress: walletClient?.account?.address,
      minBalanceNative: Number(process.env.RECEPTION_MIN_BALANCE_NATIVE ?? 5),
      devopsEmail: process.env.DEVOPS_ALERT_EMAIL,
    },
  );
  return cachedService;
}

/**
 * POST /api/reception/checkin
 *
 * Check-in por resguardo digital (US-14). Body JSON: `{ ticketJws: string }`.
 *
 * Garantías (D-05):
 *   - el resguardo es **de un solo uso** (su `jti` se consume en Redis: el mismo QR escaneado dos
 *     veces se rechaza con 409, también si los dos escaneos son simultáneos);
 *   - la noche se **ancla on-chain** con `markCheckedIn(tokenId)`: si el ancla no se difunde, el
 *     check-in no se registra (502/503) y el resguardo sigue disponible para reintentar.
 *
 * Protegida (D-04): exige sesión de `RECEPTION_ROLE`. Sin sesión → 401; con sesión de admin
 * (que no es rol de recepción) → 403.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.ticketJws) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "ticketJws requerido para check-in" },
        { status: 400 },
      );
    }

    const result = await receptionService().processTicketCheckIn(String(body.ticketJws));

    return NextResponse.json({
      success: true,
      ...result,
      processedBy: auth.session.username,
    });
  } catch (error: unknown) {
    return checkInErrorResponse("checkin", error);
  }
}

/**
 * Traduce un `CheckInError` a la respuesta HTTP correspondiente. Cualquier otro error es 500 (no
 * se disfraza de error del huésped).
 */
export function checkInErrorResponse(scope: string, error: unknown): NextResponse {
  if (error instanceof CheckInError) {
    console.error(`[API /api/reception/${scope}] ${error.code}:`, error.message);
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: HTTP_BY_CODE[error.code] ?? 400 },
    );
  }

  console.error(`[API /api/reception/${scope}] Error inesperado:`, error);
  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Error al procesar check-in",
    },
    { status: 500 },
  );
}
