"use client";

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hotelMarketplaceAbi } from "@hotel/shared/abi";
import { marketplaceAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";

export interface UseBuyNightResult {
  buy: (tokenId: string, priceWei: string) => void;
  buyResale: (tokenId: string, priceWei: string) => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/** Orquesta la compra en HotelMarketplace con wagmi y deriva el estado de la tx (CU-05/07/17). */
export function useBuyNight(): UseBuyNightResult {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  function buy(tokenId: string, priceWei: string): void {
    writeContract({
      address: marketplaceAddress,
      abi: hotelMarketplaceAbi,
      functionName: "buy",
      args: [BigInt(tokenId)],
      value: BigInt(priceWei),
    });
  }

  function buyResale(tokenId: string, priceWei: string): void {
    buy(tokenId, priceWei);
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { buy, buyResale, reset, status, hash, error };
}
