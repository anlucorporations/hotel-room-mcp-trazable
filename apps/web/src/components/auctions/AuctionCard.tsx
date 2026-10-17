"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatEther, parseEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { CURRENCY_SYMBOL } from "@hotel/shared/domain";
import { nightAuctionAbi } from "@hotel/shared/abi";
import { auctionAddress } from "@/config/chain";
import { TxModal, type TxModalCopy, type TxPhase } from "@/components/buy/TxModal";
import { NightImage } from "@/components/NightImage";
import { formatAuctionDate, livePhase, liveTimeLeft, type AuctionItem } from "@/lib/auction-view";
import { AuctionStatus } from "./AuctionStatus";
import { useAuctionWrite } from "./useAuctionWrite";

const PRIMARY =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const SECONDARY =
  "min-h-touch rounded-pill border border-line-strong px-4 text-small font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/** Acción en curso: decide qué cuerpo de revisión muestra el modal. */
type PendingAction = "bid" | "withdraw";

export interface AuctionCardProps {
  readonly item: AuctionItem;
}

/**
 * Tarjeta de una subasta (C2 · RF-13): cuenta atrás en vivo, puja con revisión previa a la firma
 * (ADR-11) y retirada de los fondos pendientes (*pull payments*, B5).
 *
 * La puja se firma contra `NightAuction` con el importe exacto revisado; el contrato sigue siendo la
 * autoridad (mínimo, ventana y anti-sniping). Al confirmarse la tx se refresca la página para releer
 * el estado on-chain (la vista es `force-dynamic`, sin caché intermedia).
 */
export function AuctionCard({ item }: AuctionCardProps) {
  const t = useTranslations("auctions");
  const tRoomType = useTranslations("roomType");
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const tx = useAuctionWrite();

  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tx.status === "confirmed") router.refresh();
  }, [tx.status, router]);

  const pending = useReadContract({
    address: auctionAddress ?? undefined,
    abi: nightAuctionAbi,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(auctionAddress && address) },
  });

  const phase = livePhase(item, nowSeconds);
  const leftSeconds = liveTimeLeft(item, nowSeconds);
  const minNextBid = BigInt(item.minNextBidWei);
  const withdrawable = (pending.data as bigint | undefined) ?? 0n;

  let bidValue: bigint | null = null;
  try {
    bidValue = amount.trim() === "" ? null : parseEther(amount.trim());
  } catch {
    bidValue = null;
  }
  const bidValid = bidValue !== null && bidValue >= minNextBid;

  const closeModal = (): void => {
    setAction(null);
    tx.reset();
  };

  const modalPhase: TxPhase =
    tx.status !== "idle" ? (tx.status as TxPhase) : action ? "review" : "idle";

  const copy: TxModalCopy = {
    review: t("tx.review"),
    reviewHint: t("tx.reviewHint"),
    status: {
      signing: t("tx.signing"),
      pending: t("tx.pending"),
      confirmed: t("tx.confirmed"),
      reverted: t("tx.reverted"),
      unverifiable: t("tx.unverifiable"),
    },
    statusHint: {
      signing: t("tx.signingHint"),
      pending: t("tx.pendingHint"),
      confirmed: t("tx.confirmedHint"),
      reverted: t("tx.revertedHint"),
      unverifiable: t("tx.unverifiableHint"),
    },
  };

  const headingId = `auction-${item.tokenId}`;

  return (
    <article
      aria-labelledby={headingId}
      data-testid="auction-card"
      data-phase={phase}
      className="flex flex-col overflow-hidden rounded-brand-lg border border-line bg-shell"
    >
      <NightImage type={item.roomType as "simple" | "doble" | "suite"} src={item.coverUrl} alt="" />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <header className="flex flex-col gap-0.5">
          <h3 id={headingId} className="font-display text-h3 text-ink">
            {t("nightHeading", { room: item.room })}
          </h3>
          <p className="text-small text-ink-soft">
            {tRoomType(item.roomType)} · {formatAuctionDate(item.dateYYYYMMDD)}
          </p>
        </header>

        <AuctionStatus item={item} phase={phase} leftSeconds={leftSeconds} />

        {phase === "OPEN" && (
          <p className="text-small text-ink-soft">{t("antiSnipe")}</p>
        )}

        {phase === "OPEN" && !isConnected && (
          <p data-testid="auction-connect-hint" className="text-small text-ink-soft">
            {t("connectWallet")}
          </p>
        )}

        {phase === "OPEN" && isConnected && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (bidValid) setAction("bid");
            }}
          >
            <label className="flex flex-col gap-1 text-small text-ink-soft" htmlFor={`bid-${item.tokenId}`}>
              {t("bidAmount", { symbol: CURRENCY_SYMBOL })}
            </label>
            <input
              id={`bid-${item.tokenId}`}
              data-testid="auction-bid-input"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={formatEther(minNextBid)}
              className="min-h-touch rounded-brand-md border border-line-strong bg-shell px-3 text-ink tabular-nums"
            />
            <p className="text-small text-ink-soft">
              {t("bidHelp", { min: formatEther(minNextBid), symbol: CURRENCY_SYMBOL })}
            </p>
            {amount.trim() !== "" && !bidValid && (
              <p role="alert" data-testid="auction-bid-invalid" className="text-small text-error">
                {t("bidInvalid", { min: formatEther(minNextBid), symbol: CURRENCY_SYMBOL })}
              </p>
            )}
            <button
              type="submit"
              data-testid="auction-bid-submit"
              disabled={!bidValid || !tx.configured}
              className={PRIMARY}
            >
              {t("bid")}
            </button>
          </form>
        )}

        {withdrawable > 0n && (
          <button
            type="button"
            data-testid="auction-withdraw"
            onClick={() => setAction("withdraw")}
            className={SECONDARY}
          >
            {t("withdraw", {
              amount: formatEther(withdrawable),
              symbol: CURRENCY_SYMBOL,
            })}
          </button>
        )}
      </div>

      <TxModal
        phase={modalPhase}
        onClose={closeModal}
        hash={tx.hash}
        copy={copy}
        reviewBody={
          action === "bid" && bidValue !== null ? (
            <p data-testid="auction-bid-review" className="text-small text-ink">
              {t("bidReview", {
                amount: formatEther(bidValue),
                symbol: CURRENCY_SYMBOL,
                room: item.room,
                date: formatAuctionDate(item.dateYYYYMMDD),
              })}
            </p>
          ) : action === "withdraw" ? (
            <p data-testid="auction-withdraw-review" className="text-small text-ink">
              {t("withdrawReview", {
                amount: formatEther(withdrawable),
                symbol: CURRENCY_SYMBOL,
              })}
            </p>
          ) : null
        }
        reviewActions={
          <>
            <button
              type="button"
              data-testid="auction-confirm-action"
              onClick={() => {
                if (action === "bid" && bidValue !== null) tx.bid(BigInt(item.tokenId), bidValue);
                if (action === "withdraw") tx.withdraw();
              }}
              className={PRIMARY}
            >
              {t("confirm")}
            </button>
            <button type="button" onClick={closeModal} className={SECONDARY}>
              {t("cancel")}
            </button>
          </>
        }
      />
    </article>
  );
}
