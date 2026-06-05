"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import {
  decodePurchaseTx,
  decodeTokenId,
  roomTypeOf,
  type NightType,
  type PurchaseTxData,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { activeChain, contractAddress } from "@/config/chain";
import { reverifyPurchase, type ClientReverifyResult } from "@/components/assistant/reverify";

/** Datos legibles de la tx de compra que se muestran al usuario antes de firmar (§5.3). */
export interface PurchaseReview {
  /** `tokenId` REAL decodificado del calldata (lo que de verdad se firmaría). */
  readonly tokenId: bigint | null;
  readonly room: number | null;
  readonly dateYYYYMMDD: number | null;
  readonly type: NightType | null;
  readonly to: `0x${string}`;
  readonly valueWei: bigint;
  readonly isResale: boolean;
  /** Re-verificación contra el precio on-chain; `null` mientras se lee el precio. */
  readonly reverify: ClientReverifyResult | null;
  /** `true` solo si la tx está verificada y se puede firmar sin riesgo. */
  readonly verified: boolean;
}

/**
 * Decodifica y re-verifica una tx de compra para el paso «Revisar» (ADR-11, RNF-19).
 * Fuente de verdad: el `tokenId` DECODIFICADO del calldata. Con él se lee el precio on-chain
 * (`priceOf` para primaria / `listingOf.price` para reventa) y se comprueba
 * `value == precio`, `to`, `chainId` y `tokenId` esperado. Reutilizable por el catálogo
 * (`BuyButton`) y por el asistente (`PurchaseHandoff`) → un único punto de verdad (DRY/SOLID).
 */
export function usePurchaseReview(tx: PurchaseTxData, expectedTokenId: bigint): PurchaseReview {
  const decoded = useMemo(() => {
    try {
      return decodePurchaseTx(tx.data);
    } catch {
      return null;
    }
  }, [tx.data]);

  const isResale = decoded?.functionName === "buyResale";
  const callTokenId = decoded?.tokenId;

  // Precio on-chain del tokenId REAL del calldata (no de lo que afirme quien construyó la tx).
  const priceRead = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: isResale ? "listingOf" : "priceOf",
    args: callTokenId !== undefined ? [callTokenId] : undefined,
    query: { enabled: callTokenId !== undefined },
  });
  const onChainPrice: bigint | undefined = isResale
    ? (priceRead.data as { price: bigint } | undefined)?.price
    : (priceRead.data as bigint | undefined);

  const reverify = useMemo<ClientReverifyResult | null>(
    () =>
      decoded && onChainPrice !== undefined
        ? reverifyPurchase({
            tx,
            expectedTokenId,
            expectedContract: contractAddress,
            expectedChainId: activeChain.id,
            onChainPriceWei: onChainPrice,
          })
        : null,
    [tx, decoded, onChainPrice, expectedTokenId],
  );

  const displayTokenId = callTokenId ?? null;
  const { room, dateYYYYMMDD } =
    displayTokenId !== null ? decodeTokenId(displayTokenId) : { room: null, dateYYYYMMDD: null };
  const type = room !== null ? (roomTypeOf(room) ?? null) : null;

  return {
    tokenId: displayTokenId,
    room,
    dateYYYYMMDD,
    type,
    to: tx.to,
    valueWei: BigInt(tx.value),
    isResale,
    reverify,
    verified: reverify?.ok === true,
  };
}
