"use client";

import { useTranslations } from "next-intl";

/**
 * Resumen flotante de la estancia (propuesta de imagen visual §3.7 · Fase C.2).
 *
 * Acompaña al formulario de reserva con lo que el huésped necesita ver antes de retener la noche:
 * habitación, fechas, **noches** e importe. El precio por noche llega **ya convertido** desde la API
 * pública con la misma tasa que usa el cobro, de modo que lo que se enseña no puede separarse de lo
 * que se pide. Si no hay tarifa publicada, no se inventa un número: se dice que el importe se
 * confirma al retener.
 *
 * Es presentacional (recibe todo por props) y se ancla con `tablet:sticky` en la columna derecha.
 */
export interface StickySummaryProps {
  roomLabel: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  /** Céntimos por noche, o `null` si la habitación no tiene tarifa publicada. */
  perNightCents: number | null;
}

export function StickySummary({
  roomLabel,
  checkInDate,
  checkOutDate,
  nights,
  perNightCents,
}: StickySummaryProps) {
  const t = useTranslations("reserve.summary");
  const totalCents = perNightCents === null ? null : perNightCents * nights;
  const eur = (cents: number): string => `${(cents / 100).toFixed(2)} €`;

  return (
    <aside
      aria-label={t("title")}
      data-testid="reserve-summary"
      className="flex h-fit flex-col gap-3 rounded-brand-lg border border-line bg-shell p-5 shadow-card tablet:sticky tablet:top-24"
    >
      <h2 className="font-display text-h4 font-semibold text-ink">{t("title")}</h2>

      <dl className="flex flex-col gap-2 text-small">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-ink-soft">{t("room")}</dt>
          <dd className="font-medium text-ink">{roomLabel}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-ink-soft">{t("dates")}</dt>
          <dd className="text-ink">{t("datesValue", { from: checkInDate, to: checkOutDate })}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-ink-soft">{t("nights")}</dt>
          <dd className="text-ink">{t("nightsValue", { count: nights })}</dd>
        </div>
        {perNightCents !== null && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-ink-soft">{t("perNight")}</dt>
            <dd className="text-ink">{eur(perNightCents)}</dd>
          </div>
        )}
      </dl>

      <div className="border-t border-line pt-3">
        {totalCents === null ? (
          <p className="text-small text-ink-soft">{t("unknown")}</p>
        ) : (
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-small font-medium text-ink-soft">{t("total")}</span>
            <span className="font-display text-h3 font-semibold text-azure-deep" data-testid="reserve-summary-total">
              {eur(totalCents)}
            </span>
          </p>
        )}
      </div>
    </aside>
  );
}
