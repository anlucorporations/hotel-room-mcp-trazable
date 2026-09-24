import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { RPC_TIMEOUT_MS } from "@hotel/shared";
import { activeChain, rpcUrl } from "@/config/chain";

/** Cliente público viem para lecturas en servidor (RSC / API routes). */
export function serverPublicClient(): PublicClient {
  // El servidor puede usar un RPC no público; si no, el mismo que el cliente.
  const url = process.env.RPC_URL ?? rpcUrl;
  // `timeout` = RPC_TIMEOUT_MS (CU-04 04a: estado degradado si el RPC no responde a tiempo, docs/SRS.md §9).
  // `cache: "no-store"` evita que Next.js cachee las respuestas JSON-RPC en RSC: el catálogo
  // debe reflejar el estado on-chain actual (ADR-09), no una lectura previa.
  return createPublicClient({
    chain: activeChain,
    transport: http(url, { timeout: RPC_TIMEOUT_MS, fetchOptions: { cache: "no-store" } }),
  });
}
