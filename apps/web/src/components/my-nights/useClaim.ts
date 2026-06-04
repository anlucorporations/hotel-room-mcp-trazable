"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseClaimResult {
  claim: () => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/** Cobra (pull-payment) los saldos pendientes de reventas con wagmi y estado de tx (CU-07). */
export function useClaim(): UseClaimResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function claim(): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "claim",
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
