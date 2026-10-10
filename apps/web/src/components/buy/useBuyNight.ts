"use client";

import { useCallback, useRef } from "react";
import { useWaitForTransactionReceipt, useSendTransaction } from "wagmi";
import { decodePurchaseTx, type PurchaseTxData } from "@hotel/shared/domain";
import { contractAddress } from "@/config/chain";
import type { TxStatus } from "@/components/tx/txStatus";
import { verifiedTxRequest } from "./verifiedTxRequest";
import { classifyBuyOutcome, type BuyErrorKey } from "./buyOutcome";

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
  /**
   * Clave i18n del motivo del fallo (D1), o `null` si no hay nada que explicar. En un revert es
   * el error REVERT del contrato («noche ya vendida», «importe incorrecto»…); cuando la consulta
   * del recibo no pudo leerse, `buyError.receiptUnreadable` (D5).
   */
  failureKey: BuyErrorKey | null;
  /**
   * Reintenta **leer el recibo** de la tx ya difundida (D5), sin volver a firmar nada. Es la
   * acción correcta cuando el estado es `unverifiable`: la compra puede estar minada y solo
   * faltaba la lectura.
   */
  retryReceipt: () => void;
}

/**
 * Firme de la compra (primaria y reventa) contra el contrato **canónico** `HotelNights` (D-02,
 * D-07). Se usa `useSendTransaction` —no `useWriteContract`— porque el calldata ya está
 * construido y verificado: re-codificarlo en la wallet reabriría la grieta que D-07 cierra
 * (antes se revisaba un contrato y se firmaba otro, el marketplace legacy).
 *
 * El resultado se clasifica con `classifyBuyOutcome` (pieza pura, D1/D2/D5): se distingue el
 * revert del contrato del fallo de lectura del recibo y solo se declara «comprada» si el recibo
 * acredita la transferencia de la noche esperada.
 */
export function useBuyNight(): UseBuyNightResult {
  const { sendTransaction, data: hash, isPending, error, reset } = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash });
  // `tokenId` del calldata firmado (D2): con él se comprueba que el recibo es NUESTRA compra.
  const expectedTokenId = useRef<bigint | null>(null);

  function send(tx: PurchaseTxData): void {
    // El destino canónico se comprueba DENTRO del firmante (defensa en profundidad): un llamante
    // nuevo que no pasara por la revisión no puede firmar contra otro contrato. El `tokenId` se
    // decodifica del MISMO calldata que se firma, para poder contrastar el recibo después (D2).
    expectedTokenId.current = decodePurchaseTx(tx.data).tokenId;
    sendTransaction(verifiedTxRequest(tx, contractAddress));
  }

  const { status, failureKey } = classifyBuyOutcome({
    isSending: isPending,
    hash,
    isReadingReceipt: receipt.isLoading,
    isReceiptSuccess: receipt.isSuccess,
    isReceiptError: receipt.isError,
    receipt: receipt.data,
    receiptError: receipt.error,
    sendError: error,
    expectedContract: contractAddress,
    expectedTokenId: expectedTokenId.current,
  });

  const refetchReceipt = receipt.refetch;
  const retryReceipt = useCallback(() => {
    void refetchReceipt();
  }, [refetchReceipt]);

  return { send, reset, status, hash, error, failureKey, retryReceipt };
}
