import { decodePurchaseTx, verifyPurchaseTx, type PurchaseTxData } from "@hotel/shared";

/**
 * Re-verificación **en cliente** de la tx de compra antes de firmar (RNF-19, ADR-11, TC-E2E-030).
 * Defensa INDEPENDIENTE del servidor: decodifica el `tokenId` real del calldata y comprueba
 * contra (a) el `tokenId` que afirma el servidor —`expectedTokenId`— y (b) el precio leído
 * on-chain por el propio cliente para ese tokenId, además de `to`/`chainId`. Función pura.
 */
export interface ClientReverifyArgs {
  readonly tx: PurchaseTxData;
  /** `tokenId` que afirma el servidor (lo que el usuario cree comprar). */
  readonly expectedTokenId: bigint;
  readonly expectedContract: `0x${string}`;
  readonly expectedChainId: number;
  /** Precio on-chain del tokenId DECODIFICADO del calldata (`priceOf`/`listingOf.price`). */
  readonly onChainPriceWei: bigint;
}

export interface ClientReverifyResult {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  /** `tokenId` real codificado en el calldata (lo que de verdad se firmaría). */
  readonly tokenId: bigint | null;
  readonly functionName: "buy" | "buyResale" | null;
}

export function reverifyPurchase(args: ClientReverifyArgs): ClientReverifyResult {
  let decoded: { tokenId: bigint; functionName: "buy" | "buyResale" };
  try {
    decoded = decodePurchaseTx(args.tx.data);
  } catch {
    return { ok: false, reasons: ["el calldata no es una compra"], tokenId: null, functionName: null };
  }

  // `verifyPurchaseTx` compara el tokenId del calldata contra `expectedTokenId` (el del servidor):
  // así el check es real, no una tautología, y protege aunque el servidor mienta.
  const verification = verifyPurchaseTx({
    tx: args.tx,
    expectedTokenId: args.expectedTokenId,
    expectedPriceWei: args.onChainPriceWei,
    expectedContract: args.expectedContract,
    expectedChainId: args.expectedChainId,
  });
  return {
    ok: verification.ok,
    reasons: [...verification.reasons],
    tokenId: decoded.tokenId,
    functionName: decoded.functionName,
  };
}
