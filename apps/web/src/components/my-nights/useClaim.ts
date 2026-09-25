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

/**
 * Retira (pull-over-push) los saldos pendientes que el contrato **canónico** `HotelNights`
 * acredita al vendedor por sus reventas (D-02, D-07, ADR-15): `claim()`.
 *
 * El saldo se lee con `pendingWithdrawals(address)` en `useMyNights`, del mismo contrato: la
 * retirada ya no apunta al marketplace legacy (cuyo método se llamaba `withdraw` y habría
 * revertido sin fondos, dejando el dinero del vendedor inaccesible).
 */
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
