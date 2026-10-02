"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { NightCard } from "@/components/NightCard";
import { ContractPausedBanner } from "@/components/ContractPausedBanner";
import type { NightView } from "@/lib/nights";

// Tarjetas con imagen de carga ansiosa (LCP): la primera fila de escritorio.
const PRIORITY_CARDS = 3;

/**
 * Mercado secundario (D-07): grid de las noches en reventa con su propia compra (`buyResale`).
 *
 * Reutiliza `NightCard`/`BuyButton` —el mismo punto de verdad de la revisión y la firma que el
 * catálogo—, así que la única diferencia entre ambos flujos es el calldata que se construye
 * (`buy` en primaria, `buyResale` en reventa) y el sitio donde se ofrece.
 */
export function ResaleMarketClient({
  nights,
  paused,
}: {
  nights: readonly NightView[];
  /** `true`/`false` = estado leído on-chain; `null` = no se pudo comprobar (M7). */
  paused: boolean | null;
}) {
  const t = useTranslations("resale");

  if (nights.length === 0) {
    return (
      <div
        data-testid="resale-empty"
        role="status"
        className="flex flex-col items-center rounded-brand-lg border border-dashed border-line bg-mist-2 px-5 py-16 text-center"
      >
        <span aria-hidden="true" className="mb-3.5 text-azure opacity-60">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 7h18M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </span>
        <h2 className="font-display text-h3 font-semibold">{t("empty")}</h2>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-ink-soft">{t("emptyHint")}</p>
        <Link
          href="/"
          data-testid="resale-back-catalog"
          className="mt-5 inline-flex min-h-touch items-center rounded-pill border border-line bg-shell px-5 font-semibold text-ink transition-colors hover:border-azure hover:text-azure"
        >
          {t("backToCatalog")}
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="resale-grid-title">
      <h2 id="resale-grid-title" className="sr-only">
        {t("title")}
      </h2>
      {/* Estado del contrato (M7): `buyResale` también lleva `whenNotPaused`. */}
      <div className="mb-4 empty:hidden">
        <ContractPausedBanner paused={paused} />
      </div>
      <p data-testid="resale-count" role="status" className="mb-4 text-small text-ink-soft">
        {t("count", { count: nights.length })}
      </p>
      <ul
        data-testid="resale-grid"
        className="grid grid-cols-1 gap-6 tablet:grid-cols-2 tablet:gap-7 desktop:grid-cols-3"
      >
        {nights.map((night, index) => (
          <li key={night.tokenId}>
            <NightCard
              night={night}
              revealIndex={index}
              priority={index < PRIORITY_CARDS}
              paused={paused === true}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
