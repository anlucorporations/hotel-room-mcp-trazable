"use client";

import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

/** Acciones que la Suite de Mantenimiento firma con EIP-712 (F4 · T4.5). */
export type MaintenanceSignAction = "ROOM_BLOCK" | "ROOM_UNBLOCK" | "PREVENTIVE_TASK" | "INSPECTION";

/** TypedData que devuelve `POST /api/mantenimiento/signatures`. */
interface PreparedSignature {
  readonly signatureId: string;
  readonly contentHash: string;
  readonly nonce: string;
  readonly deadline: string;
  readonly typedData: {
    readonly domain: Record<string, unknown>;
    readonly types: Record<string, unknown>;
    readonly primaryType: string;
    readonly message: Record<string, unknown>;
  };
}

export interface SignAndApplyInput {
  readonly action: MaintenanceSignAction;
  readonly roomId?: string;
  readonly taskId?: string;
  readonly incidentId?: string | null;
  readonly reason?: string | null;
  readonly until?: string | null;
  /** Solo `INSPECTION`: tipo y resultado que se certifican (van en el payload firmado). */
  readonly inspectionType?: string | null;
  readonly result?: string | null;
  readonly observations?: string | null;
  /**
   * Aplica el cambio off-chain con la firma ya confirmada (`SIGNED`). Debe enviar el `signatureId`
   * a la ruta de la operación; si la cadena falla al anclar, la entidad queda `PENDING_ANCHOR`.
   */
  readonly apply: (signatureId: string) => Promise<void>;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { message?: string; error?: string })
    | null;
  if (!response.ok) {
    const message = data?.message ?? (data ? data.error : null) ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

/**
 * Flujo de firma de la suite: preparar → firmar en la wallet → confirmar → aplicar.
 *
 * No reimplementa criptografía: el TypedData lo construye el servidor con el motor de F2 y la
 * confirmación la valida el servidor recuperando el firmante (viem). El hook solo orquesta.
 */
export function useMaintenanceSignature() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signAndApply = useCallback(
    async (input: SignAndApplyInput): Promise<{ signatureId: string }> => {
      setError(null);
      if (!isConnected || !address) {
        const message = "Conecta la cartera del jefe de mantenimiento para firmar.";
        setError(message);
        throw new Error(message);
      }
      setBusy(true);
      try {
        const prepared = await requestJson<PreparedSignature>("/api/mantenimiento/signatures", {
          method: "POST",
          body: JSON.stringify({
            action: input.action,
            roomId: input.roomId,
            taskId: input.taskId,
            incidentId: input.incidentId ?? null,
            reason: input.reason ?? null,
            until: input.until ?? null,
            inspectionType: input.inspectionType ?? null,
            result: input.result ?? null,
            observations: input.observations ?? null,
            signerAddress: address,
          }),
        });

        const message = prepared.typedData.message;
        const signature = await signTypedDataAsync({
          domain: prepared.typedData.domain,
          types: prepared.typedData.types,
          primaryType: prepared.typedData.primaryType,
          message: {
            ...message,
            // `nonce` es **bytes32** (se queda como hex); solo `deadline` es uint256 y viem exige
            // BigInt para los enteros. Convertir el nonce a BigInt rompía la firma con
            // `BytesSizeMismatchError` (detectado en la validación E2E de F4).
            deadline: BigInt(message.deadline as string),
          },
        } as Parameters<typeof signTypedDataAsync>[0]);

        await requestJson(`/api/mantenimiento/signatures/${prepared.signatureId}`, {
          method: "PATCH",
          body: JSON.stringify({ signature }),
        });
        await input.apply(prepared.signatureId);
        return { signatureId: prepared.signatureId };
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : "No se pudo completar la firma.";
        setError(message);
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [address, isConnected, signTypedDataAsync],
  );

  return { canSign: isConnected && Boolean(address), address, busy, error, signAndApply };
}
