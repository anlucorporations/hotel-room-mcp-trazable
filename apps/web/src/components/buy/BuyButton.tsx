"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBalance } from "wagmi";
import { buildPurchaseTxData, type SaleType } from "@hotel/shared";
import { activeChain, contractAddress } from "@/config/chain";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { classifyTxError } from "@/components/tx/txError";
import { TxModal, type TxPhase } from "./TxModal";
import { PurchaseReviewDetails } from "./PurchaseReviewDetails";
import { usePurchaseReview } from "./usePurchaseReview";
import { useBuyNight } from "./useBuyNight";

const PRIMARY_BTN =
  "min-h-touch w-full rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";
const GHOST_BTN =
  "min-h-touch w-full rounded-brand border border-line px-4 py-2 font-semibold text-ink disabled:opacity-60";

/**
 * CTA de reserva (primaria/reventa) del catálogo (CU-05/07, §3/§5.3):
 * onboarding (CU-17) → «Reservar» abre el modal en «Revisar» con la tx DECODIFICADA y
 * re-verificada contra el precio on-chain → «Firmar» dispara la compra →
 * firmar → minando → hecho (recibo) / error (reintentar). Estado «sin saldo» (CU-05 05a).
 */
export function BuyButton({
  tokenId,
  priceWei,
  saleType,
}: {
  tokenId: string;
  priceWei: string;
  saleType: SaleType;
}) {
  const t = useTranslations("buy");
  const router = useRouter();
  const { hasWallet, isConnected, isWrongNetwork, address, connect, switchToAppChain } =
    useOnboarding();
  const { buy, buyResale, reset, status, hash, error } = useBuyNight();
  const [reviewing, setReviewing] = useState(false);

  // Saldo de la cuenta conectada (CU-05 05a): si no llega al precio, se bloquea la reserva.
  const { data: balance } = useBalance({ address, query: { enabled: isConnected } });
  const insufficientBalance =
    isConnected && !isWrongNetwork && balance !== undefined && balance.value < BigInt(priceWei);

  // Tx a revisar: el calldata REAL que se firmaría; fuente de verdad del paso «Revisar».
  const tx = useMemo(
    () =>
      buildPurchaseTxData({
        tokenId: BigInt(tokenId),
        priceWei: BigInt(priceWei),
        saleType,
        contractAddress,
        chainId: activeChain.id,
      }),
    [tokenId, priceWei, saleType],
  );
  const review = usePurchaseReview(tx, BigInt(tokenId));

  // Fase del modal: el estado on-chain manda; si no hay tx en curso, mostramos «Revisar».
  const phase: TxPhase = status === "idle" ? (reviewing ? "review" : "idle") : status;
  // Rechazo de firma → status vuelve a idle (sin hash); revert → status reverted (punto 4).
  const txErrorKind = error ? classifyTxError(error) : null;
  // En curso (firma/minado): bloquea el CTA y anti-doble-envío (§3/§5.3).
  const busy = status === "signing" || status === "pending";

  // Tras confirmarse la compra, refresca el catálogo (RSC) para que la noche vendida salga.
  useEffect(() => {
    if (status === "confirmed") router.refresh();
  }, [status, router]);

  const closeModal = useCallback(() => {
    reset();
    setReviewing(false);
  }, [reset]);

  function onReserve(): void {
    if (!isConnected) return connect();
    if (isWrongNetwork) return switchToAppChain();
    if (insufficientBalance) return;
    reset();
    setReviewing(true);
  }

  function onSign(): void {
    if (!review.verified) return;
    if (saleType === "SECONDARY") buyResale(tokenId, priceWei);
    else buy(tokenId, priceWei);
  }

  function onRetry(): void {
    reset();
    setReviewing(true);
  }

  const label = !hasWallet
    ? t("needWallet")
    : !isConnected
      ? t("connectToBuy")
      : isWrongNetwork
        ? t("switchToBuy")
        : saleType === "SECONDARY"
          ? t("buyResale")
          : t("buy");

  return (
    <>
      <button
        type="button"
        data-testid={`buy-button-${tokenId}`}
        disabled={!hasWallet || insufficientBalance || busy}
        aria-disabled={!hasWallet || insufficientBalance || busy}
        aria-busy={busy}
        onClick={onReserve}
        className={PRIMARY_BTN}
      >
        {busy ? t("processing") : label}
      </button>

      {insufficientBalance && (
        <p
          data-testid="insufficient-balance"
          role="status"
          className="mt-2 text-small text-terracotta-text"
        >
          {t("insufficientBalance")}
        </p>
      )}

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        reviewBody={
          <>
            <PurchaseReviewDetails review={review} />
            {review.reverify && !review.verified && (
              <p
                data-testid="review-reverify-error"
                role="alert"
                className="mt-3 text-small text-terracotta-text"
              >
                {t("reverifyFailed")}
              </p>
            )}
            {/* Rechazo/fallo de firma: el usuario vuelve a «Revisar» y puede reintentar (punto 4). */}
            {txErrorKind && (
              <p data-testid="buy-tx-error" role="alert" className="mt-3 text-small text-terracotta-text">
                {t(`txError.${txErrorKind}`)}
              </p>
            )}
          </>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="confirm-sign"
              onClick={onSign}
              disabled={!review.verified}
              aria-disabled={!review.verified}
              className={PRIMARY_BTN}
            >
              {t("confirmSign")}
            </button>
            <button type="button" onClick={closeModal} className={GHOST_BTN}>
              {t("cancel")}
            </button>
          </>
        }
        errorActions={
          <>
            {txErrorKind && (
              <p data-testid="buy-tx-error" role="alert" className="text-small text-terracotta-text">
                {t(`txError.${txErrorKind}`)}
              </p>
            )}
            <button type="button" data-testid="tx-retry" onClick={onRetry} className={PRIMARY_BTN}>
              {t("retry")}
            </button>
          </>
        }
      />
    </>
  );
}
