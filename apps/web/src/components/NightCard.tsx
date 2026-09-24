import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import { BuyButton } from "@/components/buy/BuyButton";
import { NightImage } from "@/components/NightImage";
import { formatNightDate, formatNightDateLong, TYPE_LABEL } from "@/lib/format";
import type { NightView } from "@/lib/nights";

// Reveal escalonado (MINOR#18): tope de tarjetas con delay y paso entre ellas (ms).
const REVEAL_MAX_INDEX = 12;
const REVEAL_STEP_MS = 45;

// NOTA (MINOR#17): el mockup mostraba un botón «Guardar» (favorito) por tarjeta. Queda FUERA
// del MVP; no se implementa aquí y se documenta para evitar un GAP de paridad con el diseño.

/** Icono de calendario (stroke 2px, set propio docs/SRS.md §7). */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Badge superpuesto según el estado de la noche (docs/SRS.md §7). */
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

/**
 * Tarjeta de una noche del catálogo (CU-04, docs/SRS.md §7/§9).
 *
 * `revealIndex` activa el reveal escalonado de entrada (MINOR#18): solo lo pasa la primera
 * tanda del catálogo (no en cada load-more). La animación es opacidad + leve desplazamiento,
 * con delay derivado del índice y acotado a `REVEAL_MAX_INDEX`. Respeta `prefers-reduced-motion`
 * vía `motion-safe:` y el reset global de movimiento (globals.css), que neutraliza la transición.
 */
export function NightCard({
  night,
  revealIndex,
  priority = false,
  paused = false,
}: {
  night: NightView;
  revealIndex?: number;
  /** Carga ansiosa + `fetchPriority="high"` de la imagen (solo primeras tarjetas, LCP). */
  priority?: boolean;
  /**
   * Contrato canónico en pausa (M7): la compra se retira de la tarjeta en vez de ofrecerse para
   * que la cadena la revierta con `EnforcedPause`.
   */
  paused?: boolean;
}) {
  const t = useTranslations("catalog");
  const reveals = revealIndex !== undefined;
  // Arranca oculto solo si va a revelarse; tras montar pasa a visible para disparar la transición.
  const [revealed, setRevealed] = useState(!reveals);

  useEffect(() => {
    if (!reveals) return;
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [reveals]);

  const delayMs = reveals ? Math.min(revealIndex!, REVEAL_MAX_INDEX) * REVEAL_STEP_MS : 0;

  const alt = t("imageAlt", {
    type: TYPE_LABEL[night.type],
    room: night.room,
    date: formatNightDate(night.dateYYYYMMDD),
  });
  const priceEth = formatEther(BigInt(night.priceWei));

  return (
    <article
      data-testid={`night-card-${night.tokenId}`}
      style={reveals ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`group flex h-full flex-col overflow-hidden rounded-brand-lg border border-line bg-shell shadow-card transition duration-300 ease-brand motion-safe:hover:-translate-y-1 hover:shadow-card-hover ${
        reveals
          ? `motion-safe:transition-[opacity,transform] ${
              revealed ? "opacity-100" : "opacity-0 motion-safe:translate-y-3"
            }`
          : ""
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <NightImage type={night.type} alt={alt} priority={priority} />
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
        {/* Reaseguro de propiedad/reventa (UX#29): qué obtiene quien reserva, en lenguaje honesto.
            No mostramos una conversión a € porque el piloto no integra un oráculo de precio. */}
        <p className="mt-1.5 text-micro text-ink-soft">{t("ownershipNote")}</p>
        <div className="mt-3">
          {paused ? (
            <p
              data-testid="night-paused"
              className="rounded-pill border border-line bg-sand-2 px-4 py-2.5 text-center text-small font-semibold text-ink-soft"
            >
              {t("buyPaused")}
            </p>
          ) : (
            <BuyButton tokenId={night.tokenId} priceWei={night.priceWei} saleType={night.saleType} />
          )}
        </div>
      </div>
    </article>
  );
}
