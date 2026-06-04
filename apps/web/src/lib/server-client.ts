import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { activeChain, rpcUrl } from "@/config/chain";

/** Cliente público viem para lecturas en servidor (RSC / API routes). */
export function serverPublicClient(): PublicClient {
  // El servidor puede usar un RPC no público; si no, el mismo que el cliente.
  const url = process.env.RPC_URL ?? rpcUrl;
  return createPublicClient({ chain: activeChain, transport: http(url) });
}
