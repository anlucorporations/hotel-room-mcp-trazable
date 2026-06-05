import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { BuyButton } from "@/components/buy/BuyButton";
import { NightImage } from "@/components/NightImage";
import { formatNightDate, formatNightDateLong, TYPE_LABEL } from "@/lib/format";
import type { NightView } from "@/lib/nights";

/** Icono de calendario (stroke 2px, set propio DISEÑO-UX §3). */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Badge superpuesto según el estado de la noche (DISEÑO-UX §5.2). */
function StatusBadge({ night, t }: { night: NightView; t: ReturnType<typeof useTranslations> }) {
  if (night.saleType === "SECONDARY") {
    return (
      <span className="absolute left-3.5 top-3.5 rounded-pill bg-terracotta px-3 py-1.5 text-micro font-bold text-shell shadow-card">
        {t("resale")}
      </span>
    );
  }
  if (night.type === "suite") {
    return (
      <span className="absolute left-3.5 top-3.5 rounded-pill bg-gold px-3 py-1.5 text-micro font-bold text-ink shadow-card">
        {t("suite")}
      </span>
    );
  }
  return (
    <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-2 rounded-pill bg-shell/90 px-3 py-1.5 text-micro font-bold text-sea-deep shadow-card backdrop-blur">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-olive" />
      {t("available")}
    </span>
  );
}

/** Tarjeta de una noche del catálogo (CU-04, DISEÑO-UX §4.1). */
export function NightCard({ night }: { night: NightView }) {
  const t = useTranslations("catalog");
  const alt = t("imageAlt", {
    type: TYPE_LABEL[night.type],
    room: night.room,
    date: formatNightDate(night.dateYYYYMMDD),
  });
  const priceEth = formatEther(BigInt(night.priceWei));

  return (
    <article
      data-testid={`night-card-${night.tokenId}`}
      className="group flex h-full flex-col overflow-hidden rounded-brand-lg border border-line bg-shell shadow-card transition-shadow duration-300 hover:shadow-card-hover"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <NightImage type={night.type} alt={alt} />
        <StatusBadge night={night} t={t} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-h3 font-semibold tracking-tight">
            {t("room", { room: night.room })}
          </h3>
          <span className="text-micro font-semibold uppercase tracking-wider text-ink-soft">
            {TYPE_LABEL[night.type]}
          </span>
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-small text-ink-soft">
          <CalendarIcon />
          {formatNightDateLong(night.dateYYYYMMDD)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-display text-2xl font-semibold tracking-tight">
            {priceEth} <span className="font-sans text-small font-semibold text-ink-soft">ETH</span>
          </span>
        </div>
        <div className="mt-3">
          <BuyButton tokenId={night.tokenId} priceWei={night.priceWei} saleType={night.saleType} />
        </div>
      </div>
    </article>
  );
}
