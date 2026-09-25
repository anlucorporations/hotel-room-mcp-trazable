import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { Address, Hex } from "viem";
import { consumeOnce, verifyEIP712TicketRequest, QR_REDOWNLOAD_DOMAIN } from "@hotel/shared";
import { activeChain, contractAddress } from "@/config/chain";
import { readOnChainOwnership, type OwnershipReader } from "@/lib/onchain-ownership";

/**
 * Titularidad **obligatoria** del resguardo/pase (D-05, cierre de H-05) y **on-chain** (M7).
 *
 * Antes, los tres endpoints que emiten el pase (`/api/qr/[tokenId]`, su envío por correo y
 * `/api/wallet/pass/[tokenId]`) verificaban la firma EIP-712 **solo si el cliente enviaba las
 * cabeceras**: sin ellas se emitía un pase válido 7 días para cualquier `tokenId`, es decir,
 * cualquiera podía descargar el resguardo de una noche ajena conociendo su identificador.
 *
 * Ahora el pase exige la firma del titular y se falla en cerrado:
 *   - faltan cabeceras → 401 (no se emite nada);
 *   - firma inválida, caducada o con vigencia excesiva → 401;
 *   - la wallet firmante no es la propietaria → 401;
 *   - el `nonce` ya se usó (replay) → 401;
 *   - la cadena no se puede consultar → **503** (no se asume nada);
 *   - el token no existe en la cadena (quemado) → **404**.
 *
 * El propietario que decide es el de la **cadena** (`ownerOf`), no el índice off-chain: el índice
 * es un espejo escrito por el listener y podía ir retrasado en el momento exacto de emitir el
 * pase (con el índice decidiendo, además, el `guestWallet` del JWS). Si los dos discrepan se
 * registra el desajuste y manda la cadena (M7).
 *
 * El `nonce` se consume en Redis (`SET NX EX`), así que la autorización es de un solo uso también
 * con varias instancias del servidor.
 */
export const MAX_SIGNATURE_TTL_SECONDS = 300;

export type OwnershipResult =
  | { readonly ok: true; readonly wallet: Address; readonly onChainOwner: Address }
  | { readonly ok: false; readonly response: NextResponse };

function unauthorized(message: string): OwnershipResult {
  return {
    ok: false,
    response: NextResponse.json({ error: "UNAUTHORIZED", message }, { status: 401 }),
  };
}

/**
 * Comprueba que quien pide el resguardo es el titular de la noche.
 *
 * @param owner dirección del propietario según el registro indexado (`nfts.current_owner`). NO es
 *              la autoridad: sirve para detectar y registrar que el índice va por detrás de la
 *              cadena. La decisión la toma `ownerOf` (ver `readOnChainOwnership`).
 * @param reader lector de titularidad inyectable (los tests usan un doble; en producción, RPC).
 */
export async function requireTicketOwnership(
  request: NextRequest,
  tokenId: string,
  owner: string,
  reader?: OwnershipReader,
): Promise<OwnershipResult> {
  const walletAddress = request.headers.get("x-wallet-address");
  const signature = request.headers.get("x-signature");
  const nonce = request.headers.get("x-nonce");
  const expiresAtHeader = request.headers.get("x-expires-at");

  if (!walletAddress || !signature || !nonce || !expiresAtHeader) {
    return unauthorized(
      "Se requiere la firma EIP-712 del titular (cabeceras x-wallet-address, x-signature, x-nonce y x-expires-at)",
    );
  }

  const expiresAt = Number(expiresAtHeader);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(expiresAt) || expiresAt <= now) {
    return unauthorized("La autorización EIP-712 ha caducado; vuelve a firmarla");
  }
  if (expiresAt > now + MAX_SIGNATURE_TTL_SECONDS) {
    return unauthorized(
      `La autorización EIP-712 no puede tener una vigencia mayor de ${MAX_SIGNATURE_TTL_SECONDS} segundos`,
    );
  }

  const isValid = await verifyEIP712TicketRequest(
    walletAddress as Address,
    signature as Hex,
    BigInt(tokenId),
    nonce,
    BigInt(expiresAt),
    {
      ...QR_REDOWNLOAD_DOMAIN,
      chainId: activeChain.id,
      verifyingContract: contractAddress,
    },
  );

  if (!isValid) {
    return unauthorized("Firma EIP-712 inválida");
  }

  // La cadena manda (M7). Un RPC caído NO se interpreta como «el índice tenía razón».
  const onChain = await readOnChainOwnership(tokenId, reader);
  if (onChain.status === "unavailable") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "OWNERSHIP_UNVERIFIABLE",
          message:
            "No se pudo comprobar la titularidad en la cadena; el resguardo no se emite hasta poder verificarla.",
        },
        { status: 503 },
      ),
    };
  }
  if (onChain.status === "missing") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "TOKEN_NOT_FOUND",
          message: "Esa noche no existe en la cadena (quemada o nunca emitida).",
        },
        { status: 404 },
      ),
    };
  }

  if (onChain.owner.toLowerCase() !== walletAddress.toLowerCase()) {
    return unauthorized("La wallet firmante no es la propietaria actual de la noche en la cadena");
  }

  if (owner.toLowerCase() !== onChain.owner.toLowerCase()) {
    // No es un error de autorización (la cadena ya dijo que sí), pero es un dato de operación: el
    // índice va por detrás y conviene saberlo (el dashboard y el histórico leen del worker).
    console.warn(
      JSON.stringify({
        event: "INDEX_OUT_OF_SYNC",
        tokenId,
        indexOwner: owner,
        onChainOwner: onChain.owner,
      }),
    );
  }

  // Uso único del nonce: la misma autorización no sirve dos veces.
  const firstUse = await consumeOnce(
    `hotel:eip712:ticket:${nonce}`,
    Math.max(1, expiresAt - now),
  );
  if (!firstUse) {
    return unauthorized("Esta autorización EIP-712 ya se utilizó; firma una nueva");
  }

  return { ok: true, wallet: walletAddress as Address, onChainOwner: onChain.owner };
}
