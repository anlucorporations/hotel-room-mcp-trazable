"use client";

import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { CURRENCY_SYMBOL, ZERO_ADDRESS } from "@hotel/shared/domain";
import { countdownParts, countdownUnits, type AuctionItem, type AuctionPhase } from "@/lib/auction-view";

export interface AuctionStatusProps {
  readonly item: AuctionItem;
  /** Fase **en vivo** (la calcula la tarjeta con su reloj; el servidor solo da la instantánea). */
  readonly phase: AuctionPhase;
  /** Segundos restantes con el reloj del cliente. */
  readonly leftSeconds: number;
}

/**
 * Estado de una subasta (C2 · RF-13): fase, cuenta atrás y las tres cifras que importan
 * (reserva, mejor puja y puja mínima). Presentacional y sin red, para poder renderizarlo en una
 * prueba y reutilizarlo en el panel del hotel.
 */
export function AuctionStatus({ item, phase, leftSeconds }: AuctionStatusProps) {
  const t = useTranslations("auctions");
  const parts = countdownParts(countdownUnits(leftSeconds));
  const hasBid = item.highestBidder.toLowerCase() !== ZERO_ADDRESS;

  return (
    <div data-testid="auction-status" data-phase={phase} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          data-testid="auction-phase"
          className="rounded-pill bg-mist-2 px-2.5 py-0.5 text-small font-semibold text-ink"
        >
          {t(`phase.${phase}`)}
        </span>
        {item.isPremium && (
          <span className="rounded-pill bg-azure/10 px-2.5 py-0.5 text-small font-semibold text-azure-deep">
            {t("premium")}
          </span>
        )}
      </div>

      {phase === "OPEN" && (
        <p data-testid="auction-countdown" className="text-small text-ink-soft">
          {t("endsIn", {
            time: parts.map((part) => t(`unit.${part.unit}`, { n: part.value })).join(" "),
          })}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small">
        <dt className="text-ink-soft">{t("reserve")}</dt>
        <dd className="text-right font-semibold text-ink tabular-nums">
          {formatEther(BigInt(item.reservePriceWei))} {CURRENCY_SYMBOL}
        </dd>

        <dt className="text-ink-soft">{t("currentBid")}</dt>
        <dd data-testid="auction-current-bid" className="text-right font-semibold text-ink tabular-nums">
          {hasBid
            ? `${formatEther(BigInt(item.highestBidWei))} ${CURRENCY_SYMBOL}`
            : t("noBids")}
        </dd>

        <dt className="text-ink-soft">{t("minNextBid")}</dt>
        <dd data-testid="auction-min-bid" className="text-right font-semibold text-ink tabular-nums">
          {formatEther(BigInt(item.minNextBidWei))} {CURRENCY_SYMBOL}
        </dd>
      </dl>
    </div>
  );
}
