"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES } from "@hotel/shared/domain";
import { activeChain, contractAddress } from "@/config/chain";
import { ticketSignatureMessage } from "./ticketSignature";

/** Resguardo emitido por la API (`GET /api/qr/:tokenId`) y listo para mostrar o descargar. */
export interface IssuedTicket {
  /** URL que codifica el QR: `…/checkin#ticket=<JWS>`. */
  readonly qrPayload: string;
  /** Imagen del QR (PNG en data URL). `null` si el servidor no pudo dibujarla. */
  readonly qrDataUrl: string | null;
  /** Token firmado (JWS) que recepción canjea. */
  readonly jws: string;
  readonly tokenId: string;
  readonly roomNumber: number;
  readonly checkInDate: string;
  readonly expiresAt: string;
}

export type TicketStatus = "idle" | "signing" | "requesting" | "ready" | "error";

export interface UseTicketResult {
  readonly issue: () => void;
  readonly reset: () => void;
  readonly status: TicketStatus;
  readonly ticket: IssuedTicket | null;
  readonly error: string | null;
}

/** Mensaje en español por defecto si la API no devuelve un motivo más concreto. */
const GENERIC_ERROR = "No se pudo emitir el resguardo. Inténtalo de nuevo.";

/**
 * Emisión del resguardo de check-in desde el cliente (RF-07, CU-08).
 *
 * El resguardo es del **titular**, y eso se demuestra con una firma EIP-712 acotada en el tiempo
 * (5 minutos) y con un `nonce` de un solo uso: la API responde 401 sin ella y 401 si el firmante no
 * es el dueño **en la cadena** (`ownerOf`). Este hook solo pide la firma y llama a la API; el QR lo
 * dibuja el servidor para no depender de un servicio externo.
 */
export function useTicket(tokenId: string): UseTicketResult {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [status, setStatus] = useState<TicketStatus>("idle");
  const [ticket, setTicket] = useState<IssuedTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback((): void => {
    setStatus("idle");
    setTicket(null);
    setError(null);
  }, []);

  const issue = useCallback((): void => {
    void (async () => {
      setError(null);
      setTicket(null);

      if (!address) {
        setStatus("error");
        setError("Conecta tu cartera para obtener el resguardo.");
        return;
      }

      try {
        setStatus("signing");

        // Nonce de un solo uso emitido por el servidor: la firma no se puede reutilizar.
        const nonceRes = await fetch("/api/auth/nonce");
        if (!nonceRes.ok) throw new Error("nonce");
        const { nonce } = (await nonceRes.json()) as { nonce?: string };
        if (!nonce) throw new Error("nonce");

        const message = ticketSignatureMessage({
          tokenId,
          nonce,
          nowSeconds: Math.floor(Date.now() / 1000),
        });
        const signature = await signTypedDataAsync({
          domain: {
            ...QR_REDOWNLOAD_DOMAIN,
            chainId: activeChain.id,
            verifyingContract: contractAddress,
          },
          types: QR_REDOWNLOAD_TYPES,
          primaryType: "DownloadTicket",
          message,
        });

        setStatus("requesting");
        const res = await fetch(`/api/qr/${tokenId}`, {
          headers: {
            "x-wallet-address": address,
            "x-signature": signature,
            "x-nonce": nonce,
            "x-expires-at": String(message.expiresAt),
          },
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          setStatus("error");
          setError(body.message ?? body.error ?? GENERIC_ERROR);
          return;
        }

        setTicket((await res.json()) as IssuedTicket);
        setStatus("ready");
      } catch (cause) {
        setStatus("error");
        // Un rechazo de la firma en la cartera no es un fallo del sistema: se dice tal cual.
        const message = cause instanceof Error ? cause.message : "";
        setError(/user rejected|denied/i.test(message) ? "Firma cancelada en tu cartera." : GENERIC_ERROR);
      }
    })();
  }, [address, signTypedDataAsync, tokenId]);

  return { issue, reset, status, ticket, error };
}
