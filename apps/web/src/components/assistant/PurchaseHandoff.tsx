"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useBalance, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { TYPE_LABEL } from "@/lib/format";
import { deriveTxStatus } from "@/components/tx/txStatus";
import { classifyTxError } from "@/components/tx/txError";
import { TxModal } from "@/components/buy/TxModal";
import { usePurchaseReview } from "@/components/buy/usePurchaseReview";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import type { PreparedPurchase } from "@/lib/assistant/types";

const PRIMARY_BTN =
  "min-h-touch rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

/** Acorta una dirección 0x para microcopy de firma («0x12…ab»), igual que `WalletBar`. */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Handoff de la compra preparada por el asistente a la firma del usuario (CU-08, RNF-19).
 * Reutiliza `usePurchaseReview` (mismo punto de verdad que el catálogo): decodifica el
 * `tokenId` REAL del calldata, lee precio on-chain y re-verifica `value == precio`/`to`/`chainId`.
 *
 * Paridad IA ↔ catálogo (UX#18/#19/#20, MINOR#26): tres estados explícitos de verificación
 * (verificando con spinner / verificado / fallido con reintento), pre-comprobación de saldo,
 * microcopy de la cuenta firmante, y recibo/errores en el `TxModal`. Al confirmar se COLAPSA el
 * panel y se muestra el éxito + enlace a «Mis noches» para evitar una doble firma (UX#18).
 *
 * Honestidad de la garantía (MINOR#20/#25): el guardrail efectivo NO es el tokenId (lo afirma el
 * LLM) sino el precio on-chain + el contrato + esta revisión del usuario.
 */
export function PurchaseHandoff({ purchase }: { purchase: PreparedPurchase }) {
  const t = useTranslations("assistant");
  const { isConnected, isWrongNetwork, address, connect, switchToAppChain } = useOnboarding();
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

  // Pre-comprobación de saldo (UX#20), reutilizando la lógica del catálogo (BuyButton).
  const { data: balance } = useBalance({ address, query: { enabled: isConnected } });
  const price = review.valueWei;
  const insufficientBalance = walletReady && balance !== undefined && balance.value < price;
  const shortfall = balance !== undefined ? price - balance.value : 0n;

  const canSign =
    walletReady &&
    review.verified &&
    !insufficientBalance &&
    status !== "signing" &&
    status !== "pending";

  function sign(): void {
    if (!canSign) return;
    sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value) });
  }

  // Al confirmar se COLAPSA el panel de firma (UX#18): solo éxito + CTA, sin botón de firmar.
  if (status === "confirmed") {
    return (
      <div
        data-testid="handoff-success"
        role="status"
        className="flex flex-col gap-2 rounded-brand border border-line bg-sand-2 p-4"
      >
        <h3 className="font-display font-semibold text-ink">{t("handoff.successTitle")}</h3>
        <p className="text-small text-ink">{t("handoff.successBody")}</p>
        <Link
          href="/mis-noches"
          data-testid="handoff-my-nights"
          className={`${PRIMARY_BTN} self-start text-center`}
        >
          {t("handoff.viewMyNights")}
        </Link>
        <TxModal phase={status} onClose={reset} hash={hash} />
      </div>
    );
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

      {/* Microcopy de la cuenta firmante (UX#19): con wallet lista se aclara quién firma. */}
      {walletReady && address && (
        <p data-testid="handoff-signer" className="text-small text-ink-soft">
          {t("handoff.signer", { address: shortAddress(address) })}
        </p>
      )}

      {/* Tres estados de verificación (MINOR#26): verificando / verificado / fallido. */}
      {review.verifying && (
        <p
          data-testid="handoff-verifying"
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="flex items-center gap-2 text-small text-ink-soft"
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-sea"
          />
          {t("handoff.verifying")}
        </p>
      )}
      {review.verifyFailed && (
        <div data-testid="handoff-verify-failed" role="alert" className="text-small">
          <p className="text-terracotta-text">{t("handoff.verifyFailed")}</p>
          <button
            type="button"
            data-testid="handoff-verify-retry"
            onClick={review.refetch}
            className="mt-1 font-semibold text-sea underline hover:text-sea-deep"
          >
            {t("handoff.verifyRetry")}
          </button>
        </div>
      )}
      {review.reverify && !review.verified && !review.verifyFailed && (
        <p
          data-testid="handoff-reverify-error"
          role="alert"
          className="text-small text-terracotta-text"
        >
          {t("handoff.reverifyFailed")}
        </p>
      )}

      {/* Saldo insuficiente accionable (UX#20). */}
      {insufficientBalance && balance !== undefined && (
        <p
          data-testid="handoff-insufficient-balance"
          role="status"
          className="text-small text-terracotta-text"
        >
          {t("handoff.insufficientBalance", {
            missing: formatEther(shortfall),
            have: formatEther(balance.value),
            need: formatEther(price),
            symbol: balance.symbol,
          })}
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
        <button
          type="button"
          data-testid="handoff-sign"
          onClick={sign}
          disabled={!canSign}
          aria-disabled={!canSign}
          aria-busy={review.verifying}
          className={PRIMARY_BTN}
        >
          {t("handoff.confirm")}
        </button>
      )}

      {/* Recibo (minado) y reintento de error con paridad respecto al catálogo (UX#20). */}
      <TxModal
        phase={status}
        onClose={reset}
        hash={hash}
        pendingNote={t("handoff.pendingClosable")}
        confirmedActions={
          <Link href="/mis-noches" data-testid="handoff-receipt-my-nights" className={`${PRIMARY_BTN} text-center`}>
            {t("handoff.viewMyNights")}
          </Link>
        }
        errorActions={
          <>
            {txErrorKind && (
              <p data-testid="handoff-modal-tx-error" role="alert" className="text-small text-terracotta-text">
                {t(`handoff.txError.${txErrorKind}`)}
              </p>
            )}
            <button type="button" data-testid="handoff-retry" onClick={reset} className={PRIMARY_BTN}>
              {t("handoff.retry")}
            </button>
          </>
        }
      />
    </div>
  );
}
