"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { TYPE_LABEL } from "@/lib/format";
import { deriveTxStatus } from "@/components/tx/txStatus";
import { classifyTxError } from "@/components/tx/txError";
import { TxModal } from "@/components/buy/TxModal";
import { usePurchaseReview } from "@/components/buy/usePurchaseReview";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import type { PreparedPurchase } from "@/lib/assistant/types";

const PRIMARY_BTN =
  "min-h-touch rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

/**
 * Handoff de la compra preparada por el asistente a la firma del usuario (CU-08, RNF-19).
 * Reutiliza `usePurchaseReview` (mismo punto de verdad que el catálogo): decodifica el
 * `tokenId` REAL del calldata, lee precio on-chain y re-verifica `value == precio`/`to`/`chainId`.
 * El botón de firma se bloquea si la verificación no pasa o si la wallet no está lista
 * (desconectada o red incorrecta): nunca se firma una tx no verificada (ADR-11).
 */
export function PurchaseHandoff({ purchase }: { purchase: PreparedPurchase }) {
  const t = useTranslations("assistant");
  const { isConnected, isWrongNetwork, connect, switchToAppChain } = useOnboarding();
  const tx = purchase.tx;

  const review = usePurchaseReview(tx, BigInt(purchase.tokenId));
  const displayTokenId = review.tokenId ?? BigInt(purchase.tokenId);
  const typeLabel = review.type ? TYPE_LABEL[review.type] : null;

  const { sendTransaction, data: hash, isPending, error: sendError, reset } = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash });
  const status = deriveTxStatus({
    isPending,
    hash,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    isReverted: receipt.isError,
  });
  const txErrorKind = useMemo(
    () => (sendError && status === "idle" ? classifyTxError(sendError) : null),
    [sendError, status],
  );

  const walletReady = isConnected && !isWrongNetwork;
  const canSign =
    walletReady && review.verified && status !== "signing" && status !== "pending";

  function sign(): void {
    if (!review.verified) return;
    sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value) });
  }

  return (
    <div
      data-testid="purchase-handoff"
      className="flex flex-col gap-2 rounded-brand border border-line bg-sand-2 p-4"
    >
      <h3 className="font-display font-semibold text-ink">{t("handoff.title")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small text-ink">
        <dt className="text-ink-soft">{t("handoff.room")}</dt>
        <dd>
          {review.room !== null
            ? typeLabel
              ? t("handoff.roomValue", { room: review.room, type: typeLabel })
              : review.room
            : "—"}
        </dd>
        <dt className="text-ink-soft">{t("handoff.date")}</dt>
        <dd>{review.dateYYYYMMDD ?? "—"}</dd>
        <dt className="text-ink-soft">{t("handoff.token")}</dt>
        <dd data-testid="handoff-tokenId">{displayTokenId.toString()}</dd>
        <dt className="text-ink-soft">{t("handoff.to")}</dt>
        <dd data-testid="handoff-to" className="break-all">
          {tx.to}
        </dd>
        <dt className="text-ink-soft">{t("handoff.value")}</dt>
        <dd data-testid="handoff-value">{formatEther(BigInt(tx.value))} ETH</dd>
      </dl>

      {review.reverify && !review.verified && (
        <p data-testid="handoff-reverify-error" role="alert" className="text-small text-terracotta-text">
          {t("handoff.reverifyFailed")}
        </p>
      )}
      {txErrorKind && (
        <p data-testid="handoff-tx-error" role="alert" className="text-small text-terracotta-text">
          {t(`handoff.txError.${txErrorKind}`)}
        </p>
      )}

      {!isConnected ? (
        <button type="button" onClick={connect} className={PRIMARY_BTN}>
          {t("handoff.connect")}
        </button>
      ) : isWrongNetwork ? (
        <button type="button" data-testid="handoff-switch" onClick={switchToAppChain} className={PRIMARY_BTN}>
          {t("handoff.switchNetwork")}
        </button>
      ) : (
        <button type="button" data-testid="handoff-sign" onClick={sign} disabled={!canSign} className={PRIMARY_BTN}>
          {t("handoff.confirm")}
        </button>
      )}

      <TxModal phase={status} onClose={reset} hash={hash} />
    </div>
  );
}
