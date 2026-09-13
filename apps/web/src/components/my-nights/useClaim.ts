"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelMarketplaceAbi } from "@hotel/shared/abi";
import { marketplaceAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseClaimResult {
  claim: () => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/** Retira (Pull-over-Push) los saldos pendientes de reventas en HotelMarketplace (US-15). */
export function useClaim(): UseClaimResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function claim(): void {
    writeContract({
      address: marketplaceAddress,
      abi: hotelMarketplaceAbi,
      functionName: "withdraw",
      args: [],
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { claim, reset, status, hash, error };
}
