"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseBuyNightResult {
  buy: (tokenId: string, priceWei: string) => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/** Orquesta la compra primaria con wagmi y deriva el estado de la transacción (CU-05/17). */
export function useBuyNight(): UseBuyNightResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function buy(tokenId: string, priceWei: string): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "buy",
      args: [BigInt(tokenId)],
      value: BigInt(priceWei),
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { buy, reset, status, hash, error };
}
