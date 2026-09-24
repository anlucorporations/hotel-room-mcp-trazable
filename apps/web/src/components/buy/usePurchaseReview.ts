"use client";

import { useCallback, useMemo } from "react";
import { useReadContract } from "wagmi";
import {
  decodePurchaseTx,
  decodeTokenId,
  roomTypeOf,
  type NightType,
  type PurchaseTxData,
} from "@hotel/shared/domain";
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
  /** `true` mientras se LEE el precio on-chain (MINOR#23): «verificando», no «fallo». */
  readonly verifying: boolean;
  /**
   * `true` si la verificación NO pudo realizarse por un fallo de LECTURA del precio on-chain
   * (RPC caído, calldata indecodificable) — distinto de «el precio no coincide» (MINOR#22).
   */
  readonly verifyFailed: boolean;
  /** Re-lanza la lectura del precio on-chain para reintentar la verificación. */
  readonly refetch: () => void;
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
  // `staleTime:0` + `refetchOnMount` (UX#12): la re-verificación del paso «Revisar» NO debe
  // servirse de la caché global de 30s; siempre se contrasta contra el precio actual on-chain.
  const priceRead = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: isResale ? "listingOf" : "priceOf",
    args: callTokenId !== undefined ? [callTokenId] : undefined,
    query: { enabled: callTokenId !== undefined, staleTime: 0, refetchOnMount: "always" },
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

  // Reintento estable de la lectura on-chain (no expone la promesa de wagmi al consumidor).
  const refetchPrice = priceRead.refetch;
  const refetch = useCallback(() => {
    void refetchPrice();
  }, [refetchPrice]);

  const displayTokenId = callTokenId ?? null;
  const { room, dateYYYYMMDD } =
    displayTokenId !== null ? decodeTokenId(displayTokenId) : { room: null, dateYYYYMMDD: null };
  const type = room !== null ? (roomTypeOf(room) ?? null) : null;

  // «Verificando»: el calldata se decodificó pero aún no hay precio on-chain con que comparar.
  const verifying = callTokenId !== undefined && onChainPrice === undefined && !priceRead.isError;
  // «Fallo de verificación»: calldata indecodificable (no hay tokenId) o la lectura del
  // precio on-chain falló (RPC). NO es lo mismo que «el precio no coincide» (eso lo dice reverify).
  const verifyFailed = callTokenId === undefined || priceRead.isError;

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
    verifying,
    verifyFailed,
    refetch,
  };
}
