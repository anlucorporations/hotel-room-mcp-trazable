"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatEther } from "viem";
import { TYPE_LABEL } from "@/lib/format";
import { mergeHighlights, type NightHighlight } from "@/lib/assistant/highlights";

/** Fecha legible en el idioma del huésped a partir de `AAAAMMDD` (sin depender del huso local). */
export function formatNightDate(dateYYYYMMDD: number | null, locale: string): string | null {
  if (dateYYYYMMDD === null) return null;
  const iso = String(dateYYYYMMDD);
  if (!/^\d{8}$/.test(iso)) return null;
  const date = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(4, 6)) - 1, Number(iso.slice(6, 8))));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Calendario (trazo, `currentColor`): acompaña la fecha de la noche. Decorativo.
 */
function CalendarIcon(): React.ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * **Noches ofrecidas, ordenadas y listas para comprar** (petición del responsable, 2026-10-11).
 *
 * La información de habitaciones que devuelve el catálogo se pinta como tarjetas —habitación y tipo,
 * fecha y precio— con un botón por noche que prepara esa reserva concreta en el asistente. El orden lo
 * fija el servidor (fecha → tipo → habitación), así que la oferta se lee de un vistazo y no hay que
 * interpretar la prosa del modelo.
 *
 * Formato amigable (petición del responsable, 2026-10-13): cada noche es una ficha con cabecera
 * (habitación + tipo/reventa), la fecha con su icono, el precio destacado y la acción. Es la misma
 * jerarquía visual que la tarjeta del catálogo para que el huésped reconozca la oferta.
 */
export function NightHighlights({
  nights,
  onReserve,
}: {
  readonly nights: readonly NightHighlight[];
  readonly onReserve: (night: NightHighlight) => void;
}): React.ReactNode {
  const t = useTranslations("assistant");
  const locale = useLocale();

  if (nights.length === 0) return null;
  // El orden se fija también aquí (fecha → tipo → habitación): el dato llega ordenado del servidor y
  // de la memoria del hilo, pero la presentación no debe depender de que quien llame lo haya hecho.
  const ordenadas = mergeHighlights([], nights);

  return (
    <div data-testid="night-highlights" className="flex flex-col gap-2">
      <p className="text-micro font-semibold uppercase tracking-wide text-ink-soft">
        {t("highlights.title")}
      </p>
      <ul className="grid gap-2">
        {ordenadas.map((night) => {
          const date = formatNightDate(night.dateYYYYMMDD, locale);
          const type = night.type ? TYPE_LABEL[night.type] : null;
          const price = night.priceWei !== null ? formatEther(BigInt(night.priceWei)) : null;
          const title =
            night.room !== null ? t("highlights.room", { room: night.room }) : t("highlights.roomUnknown");

          return (
            <li
              key={night.tokenId}
              data-testid={`night-highlight-${night.tokenId}`}
              className="overflow-hidden rounded-brand border border-line bg-shell shadow-card"
            >
              {/* Cabecera: habitación a la izquierda; tipo y reventa a la derecha. */}
              <div className="flex items-center justify-between gap-2 border-b border-line bg-mist px-3 py-2">
                <span className="font-display text-body font-semibold text-ink">{title}</span>
                <span className="flex flex-wrap items-center justify-end gap-1.5">
                  {night.saleType === "SECONDARY" && (
                    <span className="rounded-pill bg-coral px-2 py-0.5 text-micro font-bold text-shell">
                      {t("highlights.resale")}
                    </span>
                  )}
                  {type && (
                    <span className="rounded-pill border border-line bg-shell px-2 py-0.5 text-micro font-semibold uppercase tracking-wider text-ink-soft">
                      {type}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex flex-col gap-2 p-3">
                <p className="flex items-center gap-2 text-small text-ink-soft">
                  <CalendarIcon />
                  <span>{date ?? "—"}</span>
                </p>
                <div className="flex items-end justify-between gap-3">
                  {price !== null ? (
                    <span
                      data-testid={`night-price-${night.tokenId}`}
                      className="font-display text-h3 font-semibold tabular-nums text-ink"
                    >
                      {price}{" "}
                      <span className="font-sans text-small font-semibold text-ink-soft">ETH</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    data-testid={`night-reserve-${night.tokenId}`}
                    onClick={() => onReserve(night)}
                    className="min-h-touch rounded-pill bg-azure px-4 py-1 text-small font-semibold text-shell transition-colors hover:bg-azure-deep"
                  >
                    {t("highlights.reserve")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
