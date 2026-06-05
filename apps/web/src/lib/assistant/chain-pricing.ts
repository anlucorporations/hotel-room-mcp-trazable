import type { Address, PublicClient } from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import type { ValidatePreparedTx } from "./orchestrator";
import { verifyPreparedPurchase, type NightPricing } from "./validate-tx";

/**
 * Lee las señales de precio/estado de una noche directamente de la cadena (independiente del
 * MCP y del LLM) para la validación server-side de la compra (ADR-11). `ownerOf` revierte si
 * la noche no existe.
 */
async function readNightPricing(
  client: PublicClient,
  address: Address,
  tokenId: bigint,
): Promise<NightPricing> {
  const read = (functionName: "soldOnce" | "isExpired" | "listingOf" | "priceOf" | "ownerOf") =>
    client.readContract({ address, abi: hotelNightsAbi, functionName, args: [tokenId] });

  try {
    await read("ownerOf");
  } catch {
    return { exists: false, soldOnce: false, expired: false, listed: false, primaryPriceWei: 0n, listingPriceWei: 0n };
  }

  const [soldOnce, expired, listing, primaryPriceWei] = await Promise.all([
    read("soldOnce") as Promise<boolean>,
    read("isExpired") as Promise<boolean>,
    read("listingOf") as Promise<{ price: bigint; active: boolean }>,
    read("priceOf") as Promise<bigint>,
  ]);
  return {
    exists: true,
    soldOnce,
    expired,
    listed: listing.active,
    primaryPriceWei,
    listingPriceWei: listing.active ? listing.price : 0n,
  };
}

/** Crea el validador independiente de la tx de compra usado por el orquestador. */
export function createTxValidator(
  client: PublicClient,
  opts: { contractAddress: Address; chainId: number },
): ValidatePreparedTx {
  return async (tokenId, tx) => {
    const id = BigInt(tokenId);
    const pricing = await readNightPricing(client, opts.contractAddress, id);
    return verifyPreparedPurchase({
      tx,
      tokenId: id,
      pricing,
      contractAddress: opts.contractAddress,
      chainId: opts.chainId,
    });
  };
}
