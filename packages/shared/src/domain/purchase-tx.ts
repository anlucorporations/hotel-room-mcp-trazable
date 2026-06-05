import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { hotelNightsAbi } from "../abi/hotel-nights";
import type { SaleType } from "./types";

/**
 * Construcción y verificación de la tx de compra **sin firma** (RF-12, ADR-11).
 *
 * El asistente y el catálogo preparan los datos de la tx; el usuario firma en MetaMask. La
 * **misma** verificación se aplica server-side (validación independiente del LLM) y en el
 * cliente antes de firmar (RNF-19): nunca se firma una tx no verificada. Funciones puras →
 * testeables y compartidas (DRY/SOLID). Los importes viajan como `string` (wei) JSON-safe.
 */
export interface PurchaseTxData {
  readonly to: Address;
  readonly data: Hex;
  readonly value: string;
  readonly chainId: number;
}

export interface BuildPurchaseTxParams {
  readonly tokenId: bigint;
  readonly priceWei: bigint;
  /** PRIMARY → `buy`; SECONDARY → `buyResale`. */
  readonly saleType: SaleType;
  readonly contractAddress: Address;
  readonly chainId: number;
}

const PURCHASE_FN = { PRIMARY: "buy", SECONDARY: "buyResale" } as const;
export type PurchaseFunctionName = (typeof PURCHASE_FN)[SaleType];

/** Construye los datos de la tx de compra (no firma). */
export function buildPurchaseTxData(params: BuildPurchaseTxParams): PurchaseTxData {
  const data = encodeFunctionData({
    abi: hotelNightsAbi,
    functionName: PURCHASE_FN[params.saleType],
    args: [params.tokenId],
  });
  return {
    to: getAddress(params.contractAddress),
    data,
    value: params.priceWei.toString(),
    chainId: params.chainId,
  };
}

export interface DecodedPurchaseTx {
  readonly functionName: PurchaseFunctionName;
  readonly tokenId: bigint;
}

/** Decodifica el calldata de una compra; lanza si el selector no es `buy`/`buyResale`. */
export function decodePurchaseTx(data: Hex): DecodedPurchaseTx {
  const decoded = decodeFunctionData({ abi: hotelNightsAbi, data });
  if (decoded.functionName !== "buy" && decoded.functionName !== "buyResale") {
    throw new Error(`El calldata no corresponde a una compra: ${decoded.functionName}`);
  }
  return { functionName: decoded.functionName, tokenId: decoded.args[0] as bigint };
}

export interface VerifyPurchaseTxParams {
  readonly tx: PurchaseTxData;
  readonly expectedTokenId: bigint;
  readonly expectedPriceWei: bigint;
  readonly expectedContract: Address;
  readonly expectedChainId: number;
}

export interface PurchaseTxVerification {
  readonly ok: boolean;
  /** Motivos de rechazo (vacío si `ok`). Estables para tests y logs. */
  readonly reasons: readonly string[];
}

/**
 * Re-verifica de forma independiente que una tx de compra apunta al contrato y cadena
 * esperados, llama a `buy`/`buyResale` con el `tokenId` pedido y lleva exactamente el precio.
 * No depende de quién la construyó (defensa en profundidad, ADR-11).
 */
export function verifyPurchaseTx(p: VerifyPurchaseTxParams): PurchaseTxVerification {
  const reasons: string[] = [];

  try {
    if (getAddress(p.tx.to) !== getAddress(p.expectedContract)) reasons.push("to≠contrato");
  } catch {
    reasons.push("to inválido");
  }
  if (p.tx.chainId !== p.expectedChainId) reasons.push("chainId≠esperado");

  let value: bigint | null = null;
  try {
    value = BigInt(p.tx.value);
  } catch {
    reasons.push("value inválido");
  }
  if (value !== null && value !== p.expectedPriceWei) reasons.push("value≠precio");

  try {
    const decoded = decodePurchaseTx(p.tx.data);
    if (decoded.tokenId !== p.expectedTokenId) reasons.push("tokenId≠pedido");
  } catch {
    reasons.push("calldata no es buy/buyResale");
  }

  return { ok: reasons.length === 0, reasons };
}
