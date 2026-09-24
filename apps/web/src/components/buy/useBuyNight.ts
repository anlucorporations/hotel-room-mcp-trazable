"use client";

import { useWaitForTransactionReceipt, useSendTransaction } from "wagmi";
import type { PurchaseTxData } from "@hotel/shared/domain";
import { contractAddress } from "@/config/chain";
import { deriveTxStatus, type TxStatus } from "@/components/tx/txStatus";
import { verifiedTxRequest } from "./verifiedTxRequest";

export interface UseBuyNightResult {
  /**
   * Firma y envía la tx de compra **ya verificada**: recibe el mismo objeto `PurchaseTxData` que
   * el paso «Revisar» decodificó y contrastó contra el precio on-chain y lo manda byte a byte
   * (D-07). No hay parámetros sueltos que puedan desincronizarse de lo revisado.
   */
  send: (tx: PurchaseTxData) => void;
  reset: () => void;
  status: TxStatus;
  hash: `0x${string}` | undefined;
  error: Error | null;
}

/**
 * Firme de la compra (primaria y reventa) contra el contrato **canónico** `HotelNights` (D-02,
 * D-07). Se usa `useSendTransaction` —no `useWriteContract`— porque el calldata ya está
 * construido y verificado: re-codificarlo en la wallet reabriría la grieta que D-07 cierra
 * (antes se revisaba un contrato y se firmaba otro, el marketplace legacy).
 */
export function useBuyNight(): UseBuyNightResult {
  const { sendTransaction, data: hash, isPending, error, reset } = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash });

  function send(tx: PurchaseTxData): void {
    // El destino canónico se comprueba DENTRO del firmante (defensa en profundidad): un llamante
    // nuevo que no pasara por la revisión no puede firmar contra otro contrato.
    sendTransaction(verifiedTxRequest(tx, contractAddress));
  }

  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });

  return { send, reset, status, hash, error };
}
