"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useReadContract, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { decodePurchaseTx, decodeTokenId, roomTypeOf } from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { activeChain, contractAddress } from "@/config/chain";
import { deriveTxStatus } from "@/components/tx/txStatus";
import { classifyTxError } from "@/components/tx/txError";
import { TxModal } from "@/components/buy/TxModal";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { reverifyPurchase } from "./reverify";
import type { PreparedPurchase } from "@/lib/assistant/types";

const BTN = "min-h-touch rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60";

/**
 * Handoff de la compra preparada por el asistente a la firma del usuario (CU-08, RNF-19).
 * La fuente de verdad es el `tokenId` DECODIFICADO del calldata (lo que de verdad se firma):
 * con él se leen precio y datos a mostrar, y se re-verifica que coincide con lo que afirma el
 * servidor y con el precio on-chain (`value == priceOf/listingOf`, `to`, `chainId`). El botón
 * de firma se bloquea si la re-verificación no pasa: nunca se firma una tx no verificada.
 */
export function PurchaseHandoff({ purchase }: { purchase: PreparedPurchase }) {
  const t = useTranslations("assistant");
  const { isConnected, connect } = useOnboarding();
  const tx = purchase.tx;

  const decoded = useMemo(() => {
    try {
      return decodePurchaseTx(tx.data);
    } catch {
      return null;
    }
  }, [tx.data]);
  const isResale = decoded?.functionName === "buyResale";
  const callTokenId = decoded?.tokenId;

  // Precio on-chain del tokenId REAL del calldata (independiente de lo que diga el asistente).
  const priceRead = useReadContract({
    address: contractAddress,
    abi: hotelNightsAbi,
    functionName: isResale ? "listingOf" : "priceOf",
    args: callTokenId !== undefined ? [callTokenId] : undefined,
    query: { enabled: callTokenId !== undefined },
  });
  const onChainPrice: bigint | undefined = isResale
    ? (priceRead.data as { price: bigint } | undefined)?.price
    : (priceRead.data as bigint | undefined);

  const reverify = useMemo(
    () =>
      decoded && onChainPrice !== undefined
        ? reverifyPurchase({
            tx,
            expectedTokenId: BigInt(purchase.tokenId),
            expectedContract: contractAddress,
            expectedChainId: activeChain.id,
            onChainPriceWei: onChainPrice,
          })
        : null,
    [tx, decoded, onChainPrice, purchase.tokenId],
  );

  const { sendTransaction, data: hash, isPending, error: sendError, reset } = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash });
  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });
  const txErrorKind = sendError && status === "idle" ? classifyTxError(sendError) : null;

  const displayTokenId = callTokenId ?? BigInt(purchase.tokenId);
  const { room, dateYYYYMMDD } = decodeTokenId(displayTokenId);
  const type = roomTypeOf(room);
  const canSign = isConnected && reverify?.ok === true && status !== "signing" && status !== "pending";

  function sign(): void {
    if (!reverify?.ok) return;
    sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value) });
  }

  return (
    <div
      data-testid="purchase-handoff"
      className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-4"
    >
      <h3 className="font-semibold">{t("handoff.title")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">{t("handoff.room")}</dt>
        <dd>{type ? t("handoff.roomValue", { room, type }) : room}</dd>
        <dt className="text-slate-500">{t("handoff.date")}</dt>
        <dd>{dateYYYYMMDD}</dd>
        <dt className="text-slate-500">{t("handoff.token")}</dt>
        <dd data-testid="handoff-tokenId">{displayTokenId.toString()}</dd>
        <dt className="text-slate-500">{t("handoff.to")}</dt>
        <dd data-testid="handoff-to" className="break-all">
          {tx.to}
        </dd>
        <dt className="text-slate-500">{t("handoff.value")}</dt>
        <dd data-testid="handoff-value">{formatEther(BigInt(tx.value))} ETH</dd>
      </dl>

      {reverify && !reverify.ok && (
        <p data-testid="handoff-reverify-error" role="alert" className="text-red-700">
          {t("handoff.reverifyFailed")}
        </p>
      )}
      {txErrorKind && (
        <p data-testid="handoff-tx-error" role="alert" className="text-red-700">
          {t(`handoff.txError.${txErrorKind}`)}
        </p>
      )}

      {!isConnected ? (
        <button type="button" onClick={connect} className={BTN}>
          {t("handoff.connect")}
        </button>
      ) : (
        <button type="button" data-testid="handoff-sign" onClick={sign} disabled={!canSign} className={BTN}>
          {t("handoff.confirm")}
        </button>
      )}

      <TxModal status={status} onClose={reset} />
    </div>
  );
}
