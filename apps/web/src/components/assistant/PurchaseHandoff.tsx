"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useBalance } from "wagmi";
import { TYPE_LABEL } from "@/lib/format";
import { TxModal } from "@/components/buy/TxModal";
import { useBuyNight } from "@/components/buy/useBuyNight";
import { canSignPurchase } from "@/components/buy/canSignPurchase";
import { usePurchaseReview } from "@/components/buy/usePurchaseReview";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import type { PreparedPurchase } from "@/lib/assistant/types";

const PRIMARY_BTN =
  "min-h-touch rounded-brand bg-azure px-4 py-2 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/** Acorta una dirección 0x para microcopy de firma («0x12…ab»), igual que `WalletBar`. */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Handoff de la compra preparada por el asistente a la firma del usuario (CU-08, docs/SRS.md §9, RNF-19).
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
  // El motivo del fallo y el estado «no se pudo comprobar» reutilizan el copy del namespace `buy`
  // (una sola redacción para el catálogo y el asistente: misma verdad, mismo texto).
  const tBuy = useTranslations("buy");
  const { isConnected, isWrongNetwork, address, connect, switchToAppChain } = useOnboarding();
  const tx = purchase.tx;

  const review = usePurchaseReview(tx, BigInt(purchase.tokenId));
  const displayTokenId = review.tokenId ?? BigInt(purchase.tokenId);
  const typeLabel = review.type ? TYPE_LABEL[review.type] : null;

  // Mismo punto único de firma y de clasificación que el catálogo (D-07, D1/D2/D5): el handoff del
  // asistente ya NO duplica `useSendTransaction` + `waitForTransactionReceipt` + `deriveTxStatus`.
  const { send, reset, status, hash, failureKey, retryReceipt } = useBuyNight();
  // Rechazo de firma antes de difundir: se explica en el propio panel.
  const reviewErrorKey = status === "idle" ? failureKey : null;

  const walletReady = isConnected && !isWrongNetwork;

  // Pre-comprobación de saldo (UX#20), reutilizando la lógica del catálogo (BuyButton).
  const { data: balance } = useBalance({ address, query: { enabled: isConnected } });
  const price = review.valueWei;
  const insufficientBalance = walletReady && balance !== undefined && balance.value < price;
  const shortfall = balance !== undefined ? price - balance.value : 0n;

  // Guarda compartida con el catálogo (D3) + la pre-comprobación de saldo propia del handoff.
  const canSign =
    canSignPurchase({ walletReady, verified: review.verified, status }) && !insufficientBalance;

  function sign(): void {
    if (!canSign) return;
    // Mismo punto único que el catálogo (D-07): `useBuyNight` revalida el destino canónico y
    // clasifica el recibo (D1/D2/D5) — el asistente no mantiene una copia de esa lógica.
    send(tx);
  }

  // Al confirmar se COLAPSA el panel de firma (UX#18): solo éxito + CTA, sin botón de firmar.
  if (status === "confirmed") {
    return (
      <div
        data-testid="handoff-success"
        role="status"
        className="flex flex-col gap-2 rounded-brand border border-line bg-mist-2 p-4"
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

  // D5: la tx pudo difundirse pero NO se pudo leer el recibo. Se COLAPSA la firma (volver a
  // firmar podría duplicar una compra ya minada): se relee el recibo y se invita a «Mis noches».
  if (status === "unverifiable") {
    return (
      <div
        data-testid="handoff-unverifiable"
        role="alert"
        className="flex flex-col gap-2 rounded-brand border border-line bg-mist-2 p-4"
      >
        <h3 className="font-display font-semibold text-ink">{tBuy("status.unverifiable")}</h3>
        <p className="text-small text-ink">{tBuy("buyError.receiptUnreadable")}</p>
        <p className="text-small text-ink-soft">{tBuy("statusHint.unverifiable")}</p>
        <button
          type="button"
          data-testid="handoff-recheck"
          onClick={retryReceipt}
          className={`${PRIMARY_BTN} self-start`}
        >
          {tBuy("recheckReceipt")}
        </button>
        <Link
          href="/mis-noches"
          data-testid="handoff-check-my-nights"
          className={`${PRIMARY_BTN} self-start text-center`}
        >
          {tBuy("viewMyNights")}
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid="purchase-handoff"
      className="flex flex-col gap-2 rounded-brand border border-line bg-mist-2 p-4"
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
            className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-azure"
          />
          {t("handoff.verifying")}
        </p>
      )}
      {review.verifyFailed && (
        <div data-testid="handoff-verify-failed" role="alert" className="text-small">
          {/* §35: «noche ya vendida» no es un problema de conexión; se dice con nombre. */}
          <p className="text-coral-text">
            {review.soldOnceState === "sold" ? t("handoff.nightAlreadySold") : t("handoff.verifyFailed")}
          </p>
          {review.soldOnceState !== "sold" && (
            <button
              type="button"
              data-testid="handoff-verify-retry"
              onClick={review.refetch}
              className="mt-1 font-semibold text-azure underline hover:text-azure-deep"
            >
              {t("handoff.verifyRetry")}
            </button>
          )}
        </div>
      )}
      {!review.verifyFailed && review.soldOnceState === "sold" && (
        <p
          data-testid="handoff-night-sold"
          role="alert"
          className="text-small text-coral-text"
        >
          {t("handoff.nightAlreadySold")}
        </p>
      )}
      {review.reverify && !review.verified && !review.verifyFailed && (
        <p
          data-testid="handoff-reverify-error"
          role="alert"
          className="text-small text-coral-text"
        >
          {t("handoff.reverifyFailed")}
        </p>
      )}

      {/* Saldo insuficiente accionable (UX#20). */}
      {insufficientBalance && balance !== undefined && (
        <p
          data-testid="handoff-insufficient-balance"
          role="status"
          className="text-small text-coral-text"
        >
          {t("handoff.insufficientBalance", {
            missing: formatEther(shortfall),
            have: formatEther(balance.value),
            need: formatEther(price),
            symbol: balance.symbol,
          })}
        </p>
      )}

      {/* D1: motivo real del fallo (rechazo de firma, noche ya vendida, importe incorrecto…). */}
      {reviewErrorKey && (
        <p data-testid="handoff-tx-error" role="alert" className="text-small text-coral-text">
          {tBuy(reviewErrorKey)}
        </p>
      )}

      {!isConnected ? (
        <button type="button" onClick={() => connect()} className={PRIMARY_BTN}>
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
            {failureKey && (
              <p data-testid="handoff-modal-tx-error" role="alert" className="text-small text-coral-text">
                {tBuy(failureKey)}
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
