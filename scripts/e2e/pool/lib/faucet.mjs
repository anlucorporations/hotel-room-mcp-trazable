import crypto from "node:crypto";
import { FAUCET_URL } from "./secrets.mjs";

/** Resuelve el PoW que exige el faucet: sha256(challenge + nonce) en hex empieza por `difficulty` ceros. */
function solvePow(challenge, difficulty = 4) {
  const prefix = "0".repeat(difficulty);
  for (let nonce = 0; ; nonce++) {
    const digest = crypto.createHash("sha256").update(challenge + nonce).digest("hex");
    if (digest.startsWith(prefix)) return String(nonce);
  }
}

/**
 * Pide moneda nativa al faucet de Codecrypto (red 81234).
 * @param {string} recipientAddress
 * @param {string|number} amount cantidad en CC (máx. 100 por petición)
 */
export async function requestFaucet(recipientAddress, amount = "10") {
  const chRes = await fetch(FAUCET_URL + "/api/challenge");
  const ch = await chRes.json();
  if (!chRes.ok || !ch.challenge) throw new Error(`challenge ${chRes.status}: ${JSON.stringify(ch)}`);
  const nonce = solvePow(ch.challenge, ch.difficulty ?? 4);
  const res = await fetch(FAUCET_URL + "/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenType: "native",
      amount: String(amount),
      recipientAddress,
      challenge: ch.challenge,
      nonce,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`faucet ${res.status}: ${JSON.stringify(body)}`);
  return body;
}
