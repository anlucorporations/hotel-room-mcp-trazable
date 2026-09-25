import { decodePurchaseTx, verifyPurchaseTx, type PurchaseTxData } from "@hotel/shared/domain";

/**
 * Re-verificación **en cliente** de la tx de compra antes de firmar (RNF-19, ADR-11, TC-E2E-030).
 *
 * Honestidad sobre las garantías (MINOR#20/#25): en el flujo del ASISTENTE, `expectedTokenId`
 * proviene en última instancia de lo que afirmó el LLM (`toolUse.input.tokenId`), igual que el
 * calldata; por eso el check `tokenId del calldata == expectedTokenId` es en buena medida
 * **tautológico** y NO detecta por sí solo «el asistente preparó la noche equivocada». El
 * guardrail EFECTIVO e independiente es doble: (a) el **precio on-chain** leído por el propio
 * cliente para el tokenId del calldata (`value == priceOf`/`listingOf.price`), y (b) el propio
 * **contrato** (que solo acepta la tx si el importe casa). La última defensa práctica frente a
 * «noche equivocada» es la **revisión del usuario** en el panel del handoff (habitación, fecha y
 * precio decodificados). El check de tokenId aquí sí aporta valor en el flujo del CATÁLOGO, donde
 * `expectedTokenId` lo fija el cliente desde la tarjeta, no el LLM. Función pura.
 */
export interface ClientReverifyArgs {
  readonly tx: PurchaseTxData;
  /**
   * `tokenId` esperado. En catálogo lo fija el cliente (defensa real); en el asistente lo afirma
   * el servidor a partir del LLM (check tautológico — ver nota de cabecera).
   */
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

  // `verifyPurchaseTx` compara `value` contra el precio on-chain (defensa real frente a importes
  // manipulados) y, además, el tokenId del calldata contra `expectedTokenId`. En el flujo del
  // asistente este último contraste es tautológico (ambos vienen del LLM): la garantía efectiva es
  // el precio on-chain + el contrato + la revisión del usuario, no el tokenId. Ver nota de cabecera.
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
