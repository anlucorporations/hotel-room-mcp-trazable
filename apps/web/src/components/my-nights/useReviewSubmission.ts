"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { QR_REDOWNLOAD_DOMAIN, REVIEW_AUTH_TYPES } from "@hotel/shared/domain";
import { activeChain, contractAddress } from "@/config/chain";

/**
 * Envío de una reseña firmada por el titular (F6 · D-59).
 *
 * Firma EIP-712 el mensaje `SubmitReview` (token, **nota**, nonce de un solo uso y caducidad) y lo
 * envía con las cabeceras que exige el guardián. Si la wallet rechaza la firma, se dice tal cual; si
 * la noche no está consumida o ya tiene reseña, la API responde 409 y se muestra su motivo.
 */
export type ReviewSubmitStatus = "idle" | "signing" | "sending" | "done" | "error";

export interface UseReviewSubmissionResult {
  readonly status: ReviewSubmitStatus;
  readonly error: string | null;
  readonly submit: (rating: number, comment: string) => Promise<void>;
  readonly reset: () => void;
}

/** Vigencia de la firma: 5 minutos, el tope que impone la API. */
const SIGNATURE_TTL_SECONDS = 300;

export function useReviewSubmission(tokenId: string): UseReviewSubmissionResult {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [status, setStatus] = useState<ReviewSubmitStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback((): void => {
    setStatus("idle");
    setError(null);
  }, []);

  const submit = useCallback(
    async (rating: number, comment: string): Promise<void> => {
      setError(null);
      if (!address) {
        setStatus("error");
        setError("Conecta tu cartera para enviar la reseña.");
        return;
      }
      try {
        setStatus("signing");
        const nonceRes = await fetch("/api/auth/nonce");
        if (!nonceRes.ok) throw new Error("nonce");
        const { nonce } = (await nonceRes.json()) as { nonce?: string };
        if (!nonce) throw new Error("nonce");

        const expiresAt = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
        const signature = await signTypedDataAsync({
          domain: {
            ...QR_REDOWNLOAD_DOMAIN,
            chainId: activeChain.id,
            verifyingContract: contractAddress,
          },
          types: REVIEW_AUTH_TYPES,
          primaryType: "SubmitReview",
          message: { tokenId: BigInt(tokenId), rating, nonce, expiresAt: BigInt(expiresAt) },
        });

        setStatus("sending");
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-wallet-address": address,
            "x-signature": signature,
            "x-nonce": nonce,
            "x-expires-at": String(expiresAt),
          },
          body: JSON.stringify({ tokenId, rating, comment }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          setStatus("error");
          setError(body.message ?? body.error ?? "No se pudo enviar la reseña.");
          return;
        }
        setStatus("done");
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        setStatus("error");
        setError(/user rejected|denied/i.test(message) ? "Firma cancelada en tu cartera." : "No se pudo enviar la reseña.");
      }
    },
    [address, signTypedDataAsync, tokenId],
  );

  return { status, error, submit, reset };
}
