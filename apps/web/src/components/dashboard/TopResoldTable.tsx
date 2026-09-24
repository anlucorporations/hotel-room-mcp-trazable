"use client";

import { useTranslations } from "next-intl";
import type { TopResoldRow } from "@/lib/dashboard-data";
import { formatNightDate } from "@/lib/format";

/**
 * Ranking de noches más revendidas (D-16). Es una **tabla real** (`<table>` con `caption`,
 * `scope="col"` y `scope="row"`), no una lista de tarjetas: el ranking es una estructura tabular y
 * así lo anuncia el lector de pantalla.
 */
export function TopResoldTable({ rows }: { rows: readonly TopResoldRow[] }) {
  const t = useTranslations("dashboard");
  const tType = useTranslations("roomType");

  if (rows.length === 0) {
    return (
      <p
        data-testid="top-resold-empty"
        className="rounded-brand-lg border border-dashed border-line bg-sand-2 px-4 py-6 text-center text-small text-ink-soft"
      >
        {t("charts.topResold.empty")}
      </p>
    );
  }

  return (
    <section
      data-testid="top-resold"
      aria-labelledby="top-resold-title"
      className="rounded-brand-lg border border-line bg-shell p-4 shadow-card"
    >
      <h3 id="top-resold-title" className="font-display text-body font-semibold text-ink">
        {t("charts.topResold.title")}
      </h3>
      <p className="mt-0.5 text-micro text-ink-soft">{t("charts.topResold.description")}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{t("charts.topResold.tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-2 py-1 text-left text-micro font-semibold text-ink">
                {t("charts.topResold.colRank")}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1 text-left text-micro font-semibold text-ink">
                {t("charts.topResold.colRoom")}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1 text-left text-micro font-semibold text-ink">
                {t("charts.topResold.colDate")}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1 text-left text-micro font-semibold text-ink">
                {t("charts.topResold.colType")}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1 text-right text-micro font-semibold text-ink">
                {t("charts.topResold.colResales")}
              </th>
              <th scope="col" className="border-b border-line px-2 py-1 text-right text-micro font-semibold text-ink">
                {t("charts.topResold.colVolume")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tokenId} className="odd:bg-sand-2/50">
                <th scope="row" className="px-2 py-1.5 text-left font-semibold text-ink">
                  {row.rank}
                </th>
                <td className="px-2 py-1.5 text-ink">{row.room}</td>
                <td className="px-2 py-1.5 text-ink-soft">{formatNightDate(row.dateYYYYMMDD)}</td>
                <td className="px-2 py-1.5 text-ink-soft">
                  {row.roomType === "desconocido" ? t("charts.roomType.unknown") : tType(row.roomType)}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-ink">{row.resaleCount}</td>
                <td className="px-2 py-1.5 text-right text-ink-soft">{row.volumeLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
