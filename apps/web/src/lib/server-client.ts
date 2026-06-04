import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { activeChain, rpcUrl } from "@/config/chain";

/** Cliente público viem para lecturas en servidor (RSC / API routes). */
export function serverPublicClient(): PublicClient {
  // El servidor puede usar un RPC no público; si no, el mismo que el cliente.
  const url = process.env.RPC_URL ?? rpcUrl;
  // `cache: "no-store"` evita que Next.js cachee las respuestas JSON-RPC en RSC: el catálogo
  // debe reflejar el estado on-chain actual (ADR-09), no una lectura previa.
  return createPublicClient({
    chain: activeChain,
    transport: http(url, { fetchOptions: { cache: "no-store" } }),
  });
}
