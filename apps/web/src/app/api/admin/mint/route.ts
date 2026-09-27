import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { AuthService, NFTsRepository, ReservationsRepository, UNANCHORED_TX_HASH } from "@hotel/shared";
import type { RoomTypeDb } from "@hotel/shared/domain";
import { toRoomTypeDb } from "@hotel/shared/domain";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();
const reservationsRepo = new ReservationsRepository();
const authService = new AuthService();

export interface MintBatchRequestItem {
  roomNumber: number;
  /** Tipo del maestro: `SIMPLE`, `DOBLE` o `SUITE` (M9: «doble» dejó de degradarse a simple). */
  roomType: RoomTypeDb;
  checkInDate: string; // YYYY-MM-DD
  basePriceWei: string;
}

/** Hash de la transacción real de minteo, cuando el llamante ya la ha emitido. */
function readTxHash(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? value : undefined;
}

/**
 * POST /api/admin/mint
 *
 * Minteo masivo (US-16) con doble control:
 *
 *   1. **Sesión + rol** (D-04): exige `DEFAULT_ADMIN_ROLE`. Sin sesión → 401; con sesión de
 *      recepción → 403.
 *   2. **Re-confirmación TOTP en el cuerpo** (RF-03): el código `confirmTotpCode` se valida
 *      contra la semilla CIFRADA del operador autenticado (`admin_users.totp_secret_enc`), no
 *      contra un secreto de entorno compartido. Se acepta también la cabecera histórica
 *      `x-mfa-token` por compatibilidad, pero el cuerpo es la vía documentada.
 *
 * **Anclaje on-chain (decisión D-04).** Esta ruta NO emite ninguna transacción: no firma ni
 * envía el minteo al contrato. Antes persistía `0xmint_<timestamp>_<tokenId>` como
 * `tx_hash_mint`, un hash inventado que parecía real y rompía la trazabilidad. Ahora hay dos
 * caminos explícitos y ninguno escribe un hash ficticio:
 *
 *   - Si el item trae `txHashMint` con formato de hash real (0x + 64 hex), la fila se guarda
 *     como ANCLADA con ese hash (lo emitió quien sí envió la transacción).
 *   - Si no lo trae, se rechaza con **422 `ONCHAIN_ANCHOR_REQUIRED`** por defecto. Con
 *     `?allowUnanchored=true` (o `allowUnanchored: true` en el cuerpo) se persiste la fila como
 *     PENDIENTE DE ANCLAJE: `on_chain_anchored = FALSE` y `tx_hash_mint = UNANCHORED_TX_HASH`
 *     (cero). Estas filas quedan EXCLUIDAS del catálogo (`queryCatalog`) y de las métricas de
 *     inventario; el worker las promueve con `markAnchored()` cuando confirma el minteo real.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as
      | { items?: unknown; confirmTotpCode?: unknown; allowUnanchored?: unknown }
      | null;

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Se requiere array de items a mintear" },
        { status: 400 },
      );
    }

    // 1. Re-confirmación TOTP del operador autenticado (RF-03).
    const headerCode = request.headers.get("x-mfa-token") ?? undefined;
    const bodyCode = typeof body.confirmTotpCode === "string" ? body.confirmTotpCode : undefined;
    const confirmCode = bodyCode ?? headerCode;

    if (!confirmCode) {
      return NextResponse.json(
        {
          error: "MFA_REQUIRED",
          message: "Se requiere re-confirmación TOTP (confirmTotpCode en el cuerpo)",
        },
        { status: 403 },
      );
    }

    const user = await authService.findUser(auth.session.username);
    if (!user || !user.active) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Operador inexistente o inactivo" },
        { status: 401 },
      );
    }

    if (!authService.verifyUserTotp(user, confirmCode)) {
      return NextResponse.json(
        { error: "INVALID_MFA", message: "Código TOTP inválido o expirado" },
        { status: 403 },
      );
    }

    const items: MintBatchRequestItem[] = body.items as MintBatchRequestItem[];

    if (items.length > 50) {
      return NextResponse.json(
        {
          error: "BATCH_SIZE_EXCEEDED",
          message: "El lote supera el límite máximo de 50 tokens por operación",
        },
        { status: 400 },
      );
    }

    // El tipo de habitación llega del cliente: se acota al vocabulario del maestro. Un valor
    // arbitrario haría que el índice mostrara un tipo que no existe (y que el filtro del catálogo
    // no pudiera encontrar), así que se rechaza en lugar de guardarlo tal cual.
    const invalidRoomType = items.find((item) => toRoomTypeDb(item.roomType) === null);
    if (invalidRoomType) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: `Tipo de habitación inválido: "${String(invalidRoomType.roomType)}". Admitidos: SIMPLE, DOBLE, SUITE`,
        },
        { status: 400 },
      );
    }

    const allowUnanchored =
      body.allowUnanchored === true || request.nextUrl.searchParams.get("allowUnanchored") === "true";

    // D-57: al acuñar se OMITEN las noches retenidas por una reserva activa. Un lote completo de
    // noches reservadas no puede acuñarse (409); las reservadas dentro de un lote mixto se omiten y
    // se informan, para no romper la venta del resto.
    const omittedReservedNights: Array<{ roomNumber: number; checkInDate: string }> = [];
    const itemsToMint: MintBatchRequestItem[] = [];
    for (const item of items) {
      if (await reservationsRepo.isNightReserved(item.roomNumber, item.checkInDate)) {
        omittedReservedNights.push({ roomNumber: item.roomNumber, checkInDate: item.checkInDate });
      } else {
        itemsToMint.push(item);
      }
    }

    if (itemsToMint.length === 0) {
      return NextResponse.json(
        {
          error: "RESERVED_NIGHTS",
          message:
            "Todas las noches del lote están retenidas por reservas activas (D-57). " +
            "Cancela o espera el vencimiento de la reserva antes de acuñarlas.",
          omittedReservedNights,
        },
        { status: 409 },
      );
    }

    // 2. Cada item debe traer un hash real o declararse explícitamente como pendiente.
    const anchorMissing =
      !allowUnanchored &&
      itemsToMint.some((item) => !readTxHash((item as { txHashMint?: unknown }).txHashMint));

    if (anchorMissing) {
      return NextResponse.json(
        {
          error: "ONCHAIN_ANCHOR_REQUIRED",
          message:
            "El minteo no está anclado on-chain. Emite la transacción y envía txHashMint por item, " +
            "o repite con allowUnanchored=true para registrar las filas como pendientes de anclaje " +
            "(quedarán excluidas del catálogo hasta que el worker las confirme).",
        },
        { status: 422 },
      );
    }

    const mintedTokenIds: string[] = [];
    const unanchoredTokenIds: string[] = [];
    const hotelContractOwner =
      process.env.CONTRACT_ADDRESS ||
      process.env.HOTEL_NFT_CONTRACT_ADDRESS ||
      auth.session.username;

    for (const item of itemsToMint) {
      const [y, m, d] = item.checkInDate.split("-");
      const dateNum = `${y}${m}${d}`;
      const tokenId = `${item.roomNumber}${dateNum}`;
      const rawSecret = `SECRET_${tokenId}_${crypto.randomBytes(8).toString("hex")}`;
      const encryptedSecret = authService.encryptCheckInSecret(rawSecret);

      const txHashMint = readTxHash((item as { txHashMint?: unknown }).txHashMint);
      const anchored = txHashMint !== undefined;

      await nftsRepo.upsertNFT({
        tokenId,
        roomNumber: item.roomNumber,
        roomType: item.roomType,
        checkInDate: item.checkInDate,
        basePriceWei: item.basePriceWei,
        status: "AVAILABLE",
        currentOwner: hotelContractOwner,
        checkInSecretEnc: encryptedSecret,
        // Nunca un hash inventado: o el hash real, o el centinela de "sin anclar".
        txHashMint: txHashMint ?? UNANCHORED_TX_HASH,
        onChainAnchored: anchored,
      });

      mintedTokenIds.push(tokenId);
      if (!anchored) unanchoredTokenIds.push(tokenId);
    }

    return NextResponse.json(
      {
        status: unanchoredTokenIds.length > 0 ? "PENDING_ANCHOR" : "SUCCESS",
        mintedCount: mintedTokenIds.length,
        tokenIds: mintedTokenIds,
        anchoredCount: mintedTokenIds.length - unanchoredTokenIds.length,
        unanchoredTokenIds,
        onChainAnchored: unanchoredTokenIds.length === 0,
        // D-57: noches reservadas que se omitieron del lote.
        omittedReservedNights,
      },
      // 202 = aceptado y persistido, pero el efecto on-chain sigue pendiente.
      { status: unanchoredTokenIds.length > 0 ? 202 : 200 },
    );
  } catch (error: unknown) {
    console.error("[API /api/admin/mint] Error:", error);
    return NextResponse.json(
      {
        error: "MINT_FAILED",
        message: error instanceof Error ? error.message : "Error al procesar minteo masivo",
      },
      { status: 500 },
    );
  }
}
