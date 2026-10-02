"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { DashboardAggregates } from "@hotel/shared/domain";
import { formatEth } from "@/lib/format";
import {
  toMonthlyChartData,
  toRoomTypeChartData,
  toTopResoldRows,
} from "@/lib/dashboard-data";
import { MonthlySalesChart } from "./MonthlySalesChart";
import { RoomTypeChart } from "./RoomTypeChart";
import { TopResoldTable } from "./TopResoldTable";

interface Metric {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly formula: string;
  readonly icon: MetricIconKey;
}

/** Icono de cada tarjeta (AdminLTE `small-box`). Decorativo: el dato va en texto. */
type MetricIconKey = "coins" | "receipt" | "tag" | "box" | "flame" | "percent";

function MetricGlyph({ icon }: { readonly icon: MetricIconKey }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon === "coins" && (
        <>
          <ellipse cx="12" cy="6.5" rx="7" ry="3" />
          <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
          <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
        </>
      )}
      {icon === "receipt" && (
        <>
          <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
          <path d="M9.5 8h5M9.5 12h5" />
        </>
      )}
      {icon === "tag" && (
        <>
          <path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L4 14.3V4h10.3l5.7 5.7a2 2 0 0 1 0 2.8z" />
          <path d="M8.5 8.5h.01" />
        </>
      )}
      {icon === "box" && (
        <>
          <path d="M12 3 20.5 7.5v9L12 21l-8.5-4.5v-9z" />
          <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
        </>
      )}
      {icon === "flame" && (
        <>
          <path d="M12 3s5 4.2 5 8.6A5 5 0 0 1 7 12c0-1.6.7-2.9 1.6-4 .3 1 .9 1.7 1.7 2.1C10.8 8 11.2 5.3 12 3z" />
        </>
      )}
      {icon === "percent" && (
        <>
          <path d="M6 18 18 6" />
          <circle cx="7.5" cy="7.5" r="2.5" />
          <circle cx="16.5" cy="16.5" r="2.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Dashboard (CU-11 + D-16, docs/SRS.md §9): KPIs escalares + serie mensual, desglose por tipo y ranking de más
 * revendidas.
 *
 * Cada KPI es un ESCALAR autoexplicativo (volumen, conteo, %), por lo que NO se muestran
 * mini-barras: comparar magnitudes heterogéneas (ETH vs conteo vs %) inducía a error sin aportar
 * información (UX#34). El corte temporal se comunica con el último bloque agregado + la hora
 * aproximada de lectura, y la zona horaria con la que se agrupan los meses se declara de forma
 * explícita (los meses no son UTC «porque sí»).
 */
export function DashboardMetrics({ data }: { data: DashboardAggregates }) {
  const t = useTranslations("dashboard");

  // Hora aproximada de corte = momento de render en el cliente (los agregados no traen timestamp).
  // Se calcula en efecto para no provocar desajuste de hidratación (UX#34).
  const [asOf, setAsOf] = useState<string | null>(null);
  useEffect(() => {
    setAsOf(new Date().toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }));
  }, []);

  const pct = Number.isInteger(data.occupancyRatioPercent)
    ? String(data.occupancyRatioPercent)
    : data.occupancyRatioPercent.toFixed(1);

  const metrics: readonly Metric[] = [
    { key: "primary-volume", label: t("primaryVolume"), value: formatEth(data.primaryVolumeWei), formula: t("formula.primaryVolume"), icon: "coins" },
    { key: "royalties", label: t("royalties"), value: formatEth(data.royaltiesWei), formula: t("formula.royalties"), icon: "receipt" },
    { key: "secondary-volume", label: t("secondaryVolume"), value: formatEth(data.secondaryVolumeWei), formula: t("formula.secondaryVolume"), icon: "tag" },
    { key: "sold", label: t("sold"), value: String(data.soldCount), formula: t("formula.sold"), icon: "box" },
    { key: "minted", label: t("minted"), value: String(data.mintedCount), formula: t("formula.minted"), icon: "box" },
    { key: "burned", label: t("burned"), value: String(data.burnedCount), formula: t("formula.burned"), icon: "flame" },
    { key: "occupancy", label: t("occupancy"), value: `${pct} %`, formula: t("formula.occupancy"), icon: "percent" },
  ];

  const monthly = toMonthlyChartData(data.monthlySeries);
  const roomTypes = toRoomTypeChartData(data.roomTypeBreakdown);
  const topResold = toTopResoldRows(data.topResold);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <p data-testid="dashboard-period" className="text-small text-ink-soft">
          {t("period", { block: data.lastBlock })}
        </p>
        <p data-testid="dashboard-timezone" className="text-micro text-ink-soft">
          {t("timeZone", { zone: data.timeZone })}
        </p>
        {asOf && (
          <p data-testid="dashboard-asof" className="text-micro text-ink-soft">
            {t("asOf", { datetime: asOf })}
          </p>
        )}
      </div>
      {/*
        Tarjetas al patrón `small-box` de AdminLTE (decisión del responsable, 2026-09-29): dato
        grande a la izquierda, icono decorativo a la derecha y banda de fórmula al pie. Sigue sin
        haber mini-barras: los KPI son escalares heterogéneos (UX#34).
      */}
      <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {metrics.map((m) => (
          <li
            key={m.key}
            data-testid={`metric-${m.key}`}
            className="flex flex-col overflow-hidden rounded-brand-lg border border-line bg-shell shadow-card"
          >
            <div className="flex flex-1 items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-small text-ink-soft">{m.label}</p>
                <p className="mt-1 font-display text-h3 font-bold text-ink">{m.value}</p>
              </div>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-brand bg-mist-2 text-azure">
                <MetricGlyph icon={m.icon} />
              </span>
            </div>
            <p className="border-t border-line bg-mist-2 px-4 py-2 text-micro text-ink-soft">
              {m.formula}
            </p>
          </li>
        ))}
      </ul>

      {data.undatedSalesCount > 0 && (
        <p
          data-testid="dashboard-undated"
          role="status"
          className="rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text"
        >
          {t("undatedWarning", { count: data.undatedSalesCount })}
        </p>
      )}

      <MonthlySalesChart points={monthly} />

      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
        <RoomTypeChart points={roomTypes} />
        <TopResoldTable rows={topResold} />
      </div>
    </section>
  );
}
