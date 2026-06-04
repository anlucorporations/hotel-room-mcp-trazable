"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseMintNightResult {
  mint: (room: number, dateYYYYMMDD: number, priceWei: bigint, metadataURI: string) => void;
  reset: () => void;
  status: TxStatus;
  error: Error | null;
}

/** Minteo de una noche por el rol MINTER (CU-02). */
export function useMintNight(): UseMintNightResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function mint(room: number, dateYYYYMMDD: number, priceWei: bigint, metadataURI: string): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(room), BigInt(dateYYYYMMDD), priceWei, metadataURI],
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { mint, reset, status, error };
}
