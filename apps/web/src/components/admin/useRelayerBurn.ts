"use client";

import { useCallback, useState } from "react";
import type { TxStatus } from "@/components/tx/txStatus";

/**
 * Quema de caducadas **firmada por el relayer** (2026-10-05).
 *
 * Antes la firmaba la cartera conectada en el navegador (`useAdminWrite`), así que el operador
 * necesitaba `BURNER_ROLE` en su cartera. Ahora la firma el servidor con la hot-wallet dedicada
 * (`RELAYER_WALLET_PRIVATE_KEY`): la clave no sale del servidor y el panel funciona con cualquier
 * cartera conectada (o con ninguna).
 *
 * Mantiene la misma forma que `useAdminWrite` (`send/reset/status/hash/error`) para que el panel siga
 * usando su `TxModal` sin cambios de estructura, y reutiliza su `TxStatus` para que las fases del
 * modal sean las mismas: `signing` (petición en curso) → `confirmed` (quema confirmada) ·
 * `reverted` (el servidor no pudo completarla).
 */
export interface RelayerBurnResult {
  readonly send: (tokenIds: readonly string[]) => Promise<void>;
  readonly reset: () => void;
  readonly status: TxStatus;
  /** Hash de la última transacción difundida por el relayer. */
  readonly hash: `0x${string}` | undefined;
  /** Mensaje listo para mostrar (el endpoint ya devuelve texto para el operador). */
  readonly error: string | null;
  /** Noches que el recibo confirmó quemadas. */
  readonly burnedCount: number;
  /** TokenIds que la simulación omitió (no quemables). */
  readonly skipped: readonly string[];
}

export function useRelayerBurn(): RelayerBurnResult {
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [burnedCount, setBurnedCount] = useState(0);
  const [skipped, setSkipped] = useState<readonly string[]>([]);

  const reset = useCallback((): void => {
    setStatus("idle");
    setHash(undefined);
    setError(null);
    setBurnedCount(0);
    setSkipped([]);
  }, []);

  const send = useCallback(async (tokenIds: readonly string[]): Promise<void> => {
    setStatus("signing");
    setError(null);
    try {
      // El servidor valida, simula por lote, firma con el relayer y espera el recibo: la fase
      // `signing` del modal cubre toda la operación (no hay firma del usuario que mostrar aparte).
      const response = await fetch("/api/admin/expired/burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIds }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        txHashes?: string[];
        burnedTokensCount?: number;
        skippedTokens?: string[];
        message?: string;
      };
      if (!response.ok) {
        setError(data.message ?? "No se pudo completar la quema.");
        setStatus("reverted");
        return;
      }
      const hashes = data.txHashes ?? [];
      if (hashes.length > 0) setHash(hashes[hashes.length - 1] as `0x${string}`);
      setBurnedCount(data.burnedTokensCount ?? 0);
      setSkipped(data.skippedTokens ?? []);
      setStatus("confirmed");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "No se pudo contactar con el servidor.");
      setStatus("reverted");
    }
  }, []);

  return { send, reset, status, hash, error, burnedCount, skipped };
}
