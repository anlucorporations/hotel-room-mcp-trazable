"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { useBalance } from "wagmi";
import { buildPurchaseTxData, type SaleType } from "@hotel/shared/domain";
import { activeChain, contractAddress, faucetAddress } from "@/config/chain";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { FaucetButton } from "@/components/wallet/FaucetButton";
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
 * CTA de reserva (primaria/reventa) del catálogo (CU-05/07, docs/SRS.md §7/§9):
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
  const { send, reset, status, hash, error } = useBuyNight();
  const [reviewing, setReviewing] = useState(false);
  // Tras confirmar hay que refrescar el catálogo (RSC), pero NO durante el `confirmed` (eso
  // destruye el disparador antes de devolverle el foco, MAJOR#6). Se difiere a `onClose`.
  const refreshPending = useRef(false);

  const walletReady = isConnected && !isWrongNetwork;

  // Saldo de la cuenta conectada (CU-05 05a): si no llega al precio, se bloquea la reserva.
  const { data: balance } = useBalance({ address, query: { enabled: isConnected } });
  const price = BigInt(priceWei);
  const insufficientBalance =
    walletReady && balance !== undefined && balance.value < price;
  // Cuánto falta para poder reservar (UX#3): mensaje accionable en vez de uno mudo.
  const shortfall = balance !== undefined ? price - balance.value : 0n;

  // Tx a revisar: el calldata REAL que se firmaría; fuente de verdad del paso «Revisar».
  const tx = useMemo(
    () =>
      buildPurchaseTxData({
        tokenId: BigInt(tokenId),
        priceWei: price,
        saleType,
        contractAddress,
        chainId: activeChain.id,
      }),
    [tokenId, price, saleType],
  );
  const review = usePurchaseReview(tx, BigInt(tokenId));

  // Fase del modal: el estado on-chain manda; si no hay tx en curso, mostramos «Revisar».
  const phase: TxPhase = status === "idle" ? (reviewing ? "review" : "idle") : status;
  // Rechazo de firma → status vuelve a idle (sin hash); revert → status reverted (punto 4).
  const txErrorKind = error ? classifyTxError(error) : null;
  // En curso (firma/minado): bloquea el CTA y anti-doble-envío (§3/§5.3).
  const busy = status === "signing" || status === "pending";

  // El refresco del catálogo se marca al confirmar y se ejecuta al cerrar el modal (MAJOR#6).
  useEffect(() => {
    if (status === "confirmed") refreshPending.current = true;
  }, [status]);

  const closeModal = useCallback(() => {
    reset();
    setReviewing(false);
    if (refreshPending.current) {
      refreshPending.current = false;
      // Diferido: el foco ya volvió al disparador (aún conectado) antes de reemplazar la tarjeta.
      router.refresh();
    }
  }, [reset, router]);

  function onReserve(): void {
    if (!isConnected) return connect();
    if (isWrongNetwork) return switchToAppChain();
    if (insufficientBalance) return;
    reset();
    setReviewing(true);
  }

  // Falla cerrado (MINOR#21): no se firma si la wallet no está lista ni si no está verificada.
  const canSign = walletReady && review.verified;

  function onSign(): void {
    if (!canSign) return;
    // D-07: se firma EXACTAMENTE el objeto que `usePurchaseReview` decodificó y re-verificó.
    send(tx);
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

      {insufficientBalance && balance !== undefined && (
        <div data-testid="insufficient-balance" role="status" className="mt-2 text-small text-terracotta-text">
          <p>
            {t("insufficientBalanceDetail", {
              missing: formatEther(shortfall),
              have: formatEther(balance.value),
              need: formatEther(price),
              symbol: balance.symbol,
            })}
          </p>
          {/* UX#3: si hay faucet de pruebas configurado, ofrecemos conseguir ETH aquí mismo.
              `FaucetButton` se autogestiona (null si no aplica); el guard evita renderizar el
              contenedor cuando no hay faucet, manteniendo el comportamiento sin faucet. */}
          {faucetAddress !== null && (
            <div className="mt-2">
              <FaucetButton />
            </div>
          )}
        </div>
      )}

      <TxModal
        phase={phase}
        onClose={closeModal}
        hash={hash}
        pendingNote={t("pendingClosable")}
        reviewBody={
          <>
            <PurchaseReviewDetails review={review} />

            {/* Estado de la re-verificación on-chain (MINOR#22/#23): «verificando» vs «fallo». */}
            {review.verifying && (
              <p
                data-testid="review-verifying"
                role="status"
                aria-live="polite"
                className="mt-3 flex items-center gap-2 text-small text-ink-soft"
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-sea"
                />
                {t("verifyingPrice")}
              </p>
            )}
            {review.verifyFailed && (
              <div data-testid="review-verify-failed" role="alert" className="mt-3 text-small">
                {/* §35: si la cadena YA respondió que la noche está vendida, el problema no es la
                    conexión del huésped: se lo decimos con nombre y le ofrecemos otra noche. */}
                <p className="text-terracotta-text">
                  {review.soldOnceState === "sold" ? t("nightAlreadySold") : t("verifyFailed")}
                </p>
                {review.soldOnceState === "sold" ? (
                  <Link
                    href="/catalogo"
                    data-testid="review-pick-another"
                    className="mt-2 inline-block font-semibold text-sea underline hover:text-sea-deep"
                  >
                    {t("pickAnotherNight")}
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-testid="review-verify-retry"
                    onClick={review.refetch}
                    className="mt-2 font-semibold text-sea underline hover:text-sea-deep"
                  >
                    {t("verifyRetry")}
                  </button>
                )}
              </div>
            )}
            {/* §35: noche ya vendida detectada aunque las lecturas de precio funcionen (el índice
                desfasado ofrece como disponible una noche que `buy` rechazaría). */}
            {!review.verifyFailed && review.soldOnceState === "sold" && (
              <div data-testid="review-night-sold" role="alert" className="mt-3 text-small">
                <p className="text-terracotta-text">{t("nightAlreadySold")}</p>
                <Link
                  href="/catalogo"
                  data-testid="review-pick-another"
                  className="mt-2 inline-block font-semibold text-sea underline hover:text-sea-deep"
                >
                  {t("pickAnotherNight")}
                </Link>
              </div>
            )}
            {/* El precio cambió on-chain: re-verificación con causa+acción (UX#7). */}
            {review.reverify && !review.verified && !review.verifyFailed && (
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

            {/* Reaseguro al cancelar: nada se cobra hasta firmar (MINOR#32). */}
            <p className="mt-4 text-micro text-ink-soft">{t("noChargeUntilSign")}</p>
          </>
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="confirm-sign"
              onClick={onSign}
              disabled={!canSign}
              aria-disabled={!canSign}
              className={PRIMARY_BTN}
            >
              {t("confirmSign")}
            </button>
            <button type="button" onClick={closeModal} className={GHOST_BTN}>
              {t("cancel")}
            </button>
          </>
        }
        confirmedActions={
          <Link href="/mis-noches" data-testid="receipt-my-nights" className={`${PRIMARY_BTN} text-center`}>
            {t("viewMyNights")}
          </Link>
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
