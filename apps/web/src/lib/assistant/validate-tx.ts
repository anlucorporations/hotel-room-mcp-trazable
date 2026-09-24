import {
  computeNightState,
  isPurchasable,
  verifyPurchaseTx,
  type PurchaseTxData,
  type SaleType,
} from "@hotel/shared/domain";

/**
 * Validación server-side **independiente del LLM** de la tx de compra preparada (ADR-11,
 * RNF-19, TC-MCP-004). Re-deriva el precio y el estado de la noche con señales on-chain
 * leídas por el propio servidor y comprueba que la tx apunta al contrato/cadena esperados,
 * llama a buy/buyResale con el tokenId pedido y lleva exactamente el precio. Función pura.
 */
export interface NightPricing {
  readonly exists: boolean;
  readonly soldOnce: boolean;
  readonly expired: boolean;
  readonly listed: boolean;
  readonly primaryPriceWei: bigint;
  readonly listingPriceWei: bigint;
}

export interface PreparedTxCheck {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

const SALE_TYPE_BY_STATE: Partial<Record<NonNullable<ReturnType<typeof computeNightState>>, SaleType>> = {
  DISPONIBLE: "PRIMARY",
  LISTADA_SECUNDARIO: "SECONDARY",
};

/** Precio y tipo de venta esperados según el estado on-chain; `null` si no es comprable. */
export function expectedPurchaseTerms(
  pricing: NightPricing,
): { priceWei: bigint; saleType: SaleType } | null {
  if (!isPurchasable(pricing)) return null;
  const state = computeNightState(pricing);
  const saleType = state ? SALE_TYPE_BY_STATE[state] : undefined;
  if (!saleType) return null;
  return {
    priceWei: saleType === "PRIMARY" ? pricing.primaryPriceWei : pricing.listingPriceWei,
    saleType,
  };
}

export interface VerifyPreparedPurchaseArgs {
  readonly tx: PurchaseTxData;
  readonly tokenId: bigint;
  readonly pricing: NightPricing;
  readonly contractAddress: `0x${string}`;
  readonly chainId: number;
}

export function verifyPreparedPurchase(args: VerifyPreparedPurchaseArgs): PreparedTxCheck {
  if (!args.pricing.exists) return { ok: false, reasons: ["la noche no existe"] };
  const terms = expectedPurchaseTerms(args.pricing);
  if (!terms) return { ok: false, reasons: ["la noche no es comprable"] };
  return verifyPurchaseTx({
    tx: args.tx,
    expectedTokenId: args.tokenId,
    expectedPriceWei: terms.priceWei,
    expectedContract: args.contractAddress,
    expectedChainId: args.chainId,
  });
}
