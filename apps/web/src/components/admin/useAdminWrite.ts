"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

/** Nombres de las funciones de escritura del contrato (solo `nonpayable`). */
type WriteFn = Extract<
  (typeof hotelNightsAbi)[number],
  { type: "function"; stateMutability: "nonpayable" }
>["name"];

export interface UseAdminWriteResult {
  /** Lanza una escritura del contrato (firma + envío) con los argumentos dados. */
  send: (functionName: WriteFn, args: readonly unknown[]) => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/**
 * Escritura genérica del contrato para los paneles del back-office (DRY): royalty, pausa,
 * fondos, burn y roles comparten el ciclo firmar→minar→confirmar/revertir de wagmi. El gating
 * por rol es solo UX; la autoridad es el contrato (revierte `AccessControlUnauthorizedAccount`).
 */
export function useAdminWrite(): UseAdminWriteResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function send(functionName: WriteFn, args: readonly unknown[]): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi as Abi,
      functionName,
      args: args as unknown[],
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { send, reset, status, hash, error };
}
