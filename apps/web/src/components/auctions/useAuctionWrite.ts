"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { nightAuctionAbi } from "@hotel/shared/abi";
import { auctionAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseAuctionWriteResult {
  /** `false` si `NEXT_PUBLIC_AUCTION_ADDRESS` no está configurada: no hay nada que firmar. */
  readonly configured: boolean;
  /** Puja por una noche (pago en el `value`). */
  readonly bid: (tokenId: bigint, valueWei: bigint) => void;
  /** Liquida una subasta cerrada (cualquiera puede hacerlo; entrega la noche al ganador). */
  readonly settle: (tokenId: bigint) => void;
  /** Retira los fondos pendientes del llamante (pujas superadas o importe del hotel). */
  readonly withdraw: () => void;
  readonly reset: () => void;
  readonly status: TxStatus;
  readonly hash: `0x${string}` | undefined;
  readonly error: Error | null;
}

/**
 * Escrituras del contrato de **subastas** (C2 · RF-13): pujar (pagadera), liquidar y retirar.
 *
 * Mismo ciclo firmar→minar→confirmar/revertir que el resto de la plataforma (`deriveTxStatus`), con
 * el ABI y la dirección de `NightAuction`. La autoridad es el contrato: la UI solo evita ofrecer
 * acciones imposibles (p. ej. pujar por debajo del mínimo o liquidar antes del cierre).
 */
export function useAuctionWrite(): UseAuctionWriteResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function write(functionName: "bid" | "settle" | "withdraw", args: readonly unknown[], value?: bigint): void {
    if (!auctionAddress) return;
    writeContract({
      address: auctionAddress,
      abi: nightAuctionAbi as Abi,
      functionName,
      args: args as unknown[],
      ...(value === undefined ? {} : { value }),
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return {
    configured: auctionAddress !== null,
    bid: (tokenId, valueWei) => write("bid", [tokenId], valueWei),
    settle: (tokenId) => write("settle", [tokenId]),
    withdraw: () => write("withdraw", []),
    reset,
    status,
    hash,
    error,
  };
}
