import "server-only";
import { randomBytes } from "node:crypto";
import { SESSION_NONCE_TTL_SECONDS } from "@hotel/shared";

/**
 * Almacén de nonces SIWE de un solo uso con caducidad (CU-01, docs/SRS.md §9, `SESSION_NONCE_TTL`). En
 * memoria: válido para un runtime único (piloto, ADR-04). Rechaza replays (consumo único)
 * y nonces caducados (CWE-294).
 */
const nonces = new Map<string, number>();

export function issueNonce(): string {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, Date.now() + SESSION_NONCE_TTL_SECONDS * 1000);
  return nonce;
}

/** Consume el nonce (un solo uso). Devuelve `true` solo si existía y no había caducado. */
export function consumeNonce(nonce: string): boolean {
  const expiry = nonces.get(nonce);
  nonces.delete(nonce);
  return expiry !== undefined && expiry >= Date.now();
}
