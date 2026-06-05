"use client";

import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { formatNightDateLong, TYPE_LABEL } from "@/lib/format";
import type { PurchaseReview } from "./usePurchaseReview";

/**
 * Resumen DECODIFICADO de la tx de compra (contrato `to`, importe en ETH, habitación/fecha/
 * tokenId) que el usuario ve antes de firmar (§5.3, ADR-11). Presentacional y compartido por
 * el catálogo y el asistente para no duplicar el formato (DRY).
 */
export function PurchaseReviewDetails({ review }: { review: PurchaseReview }) {
  const t = useTranslations("buy");
  const typeLabel = review.type ? TYPE_LABEL[review.type] : null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small text-ink">
      <dt className="text-ink-soft">{t("reviewRoom")}</dt>
      <dd data-testid="review-room">
        {review.room !== null
          ? typeLabel
            ? `${t("roomLabel", { room: review.room })} · ${typeLabel}`
            : t("roomLabel", { room: review.room })
          : "—"}
      </dd>

      <dt className="text-ink-soft">{t("reviewDate")}</dt>
      <dd data-testid="review-date">
        {review.dateYYYYMMDD !== null ? formatNightDateLong(review.dateYYYYMMDD) : "—"}
      </dd>

      <dt className="text-ink-soft">{t("reviewAmount")}</dt>
      <dd data-testid="review-amount" className="font-display font-semibold">
        {formatEther(review.valueWei)} ETH
      </dd>

      <dt className="text-ink-soft">{t("reviewToken")}</dt>
      <dd data-testid="review-token">{review.tokenId !== null ? review.tokenId.toString() : "—"}</dd>

      <dt className="text-ink-soft">{t("reviewContract")}</dt>
      <dd data-testid="review-contract" className="break-all text-ink-soft">
        {review.to}
      </dd>
    </dl>
  );
}
