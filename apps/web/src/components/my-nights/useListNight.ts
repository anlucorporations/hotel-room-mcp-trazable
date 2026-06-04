"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseListNightResult {
  list: (tokenId: string, priceWei: bigint) => void;
  unlist: (tokenId: string) => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/** Listar/cancelar la reventa de una noche con wagmi y estado de tx (CU-06). */
export function useListNight(): UseListNightResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function list(tokenId: string, priceWei: bigint): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "list",
      args: [BigInt(tokenId), priceWei],
    });
  }

  function unlist(tokenId: string): void {
    writeContract({
      address: contractAddress,
      abi: hotelNightsAbi,
      functionName: "unlist",
      args: [BigInt(tokenId)],
    });
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { list, unlist, reset, status, hash, error };
}
