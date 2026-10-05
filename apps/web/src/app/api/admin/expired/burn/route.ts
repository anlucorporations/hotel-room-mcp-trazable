import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BurnerService, type BurnCycleResult } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { activeChain, contractAddress, rpcUrl } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/expired/burn — **quema de noches caducadas firmada por el relayer** (CU-13).
 *
 * Cuerpo: `{ tokenIds: string[] }` (los que el panel ha descubierto escaneando la cadena).
 *
 * **Por qué un relayer.** Hasta ahora la quema la firmaba la cartera conectada en el navegador, así
 * que el operador necesitaba `BURNER_ROLE` en su cartera. Con el relayer la firma el servidor con una
 * hot-wallet dedicada (`RELAYER_WALLET_PRIVATE_KEY`, cuenta 4 de Anvil): el panel deja de depender de
 * qué cartera tenga conectada el operador y la clave no sale del servidor. Mismo patrón que el
 * check-in de recepción (`/api/reception/checkin`).
 *
 * Garantías:
 *   - exige sesión de administración (sin sesión → 401);
 *   - valida los `tokenIds` (enteros, sin duplicados, acotados) y **el contrato revalida** cada uno
 *     (`NotExpired`/`AlreadySold`): la simulación por lote omite lo no quemable sin tumbar el resto;
 *   - comprueba el saldo del firmante y avisa a devops si no hay gas.
 */

/** Tope defensivo de entrada: el contrato corta en `burnBatchMax` (50), pero no se aceptan lotes enormes. */
const MAX_TOKEN_IDS = 200;

interface RelayerContext {
  readonly service: BurnerService;
  readonly wallet: ReturnType<typeof createWalletClient> | null;
  readonly operatorAddress: `0x${string}` | undefined;
}

/**
 * Contexto del relayer **único por proceso** (singleton deliberado, igual que el check-in): el
 * servicio serializa los envíos de la misma hot-wallet para que dos quemas simultáneas no colisionen
 * en el `nonce`. Crear el servicio por request devolvería esa colisión.
 */
let cached: RelayerContext | null = null;

export function relayerContext(): RelayerContext {
  if (cached) return cached;
  const privateKey = process.env.RELAYER_WALLET_PRIVATE_KEY;
  const wallet = privateKey
    ? createWalletClient({
        account: privateKeyToAccount(privateKey as Hex),
        chain: activeChain,
        transport: http(process.env.RPC_URL ?? rpcUrl),
      })
    : null;
  cached = { service: new BurnerService(), wallet, operatorAddress: wallet?.account?.address };
  return cached;
}

/** Estados del ciclo → HTTP. `NO_TOKENS` es un éxito (no había nada que quemar). */
const STATUS: Record<BurnCycleResult["reason"], number> = {
  COMPLETED: 200,
  NO_TOKENS: 200,
  LOCKED: 409,
  INSUFFICIENT_GAS: 503,
  ERROR: 502,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { tokenIds?: unknown } | null;
  const raw = body?.tokenIds;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Se espera { tokenIds: string[] }." },
      { status: 400 },
    );
  }

  const tokenIds = [
    ...new Set(raw.filter((value): value is string => typeof value === "string" && /^\d+$/.test(value))),
  ]
    .slice(0, MAX_TOKEN_IDS)
    .map((value) => BigInt(value));

  if (tokenIds.length === 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "No hay tokenIds válidos que quemar." },
      { status: 400 },
    );
  }

  const { service, wallet, operatorAddress } = relayerContext();
  if (!wallet || !operatorAddress) {
    return NextResponse.json(
      { error: "RELAYER_NOT_CONFIGURED", message: "El relayer de quema no está configurado." },
      { status: 503 },
    );
  }

  try {
    const result = await service.burnTokens(serverPublicClient(), wallet, {
      nftContractAddress: contractAddress,
      operatorAddress,
      minBalanceNative: Number(process.env.RELAYER_MIN_BALANCE_NATIVE ?? 1),
      devopsEmail: process.env.DEVOPS_ALERT_EMAIL,
    }, tokenIds);
    return NextResponse.json(result, { status: STATUS[result.reason] });
  } catch (error: unknown) {
    console.error("[API /api/admin/expired/burn] POST:", error);
    return NextResponse.json(
      {
        error: "BURN_FAILED",
        message: error instanceof Error ? error.message : "No se pudo completar la quema.",
      },
      { status: 502 },
    );
  }
}
