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
    { key: "primary-volume", label: t("primaryVolume"), value: formatEth(data.primaryVolumeWei), formula: t("formula.primaryVolume") },
    { key: "royalties", label: t("royalties"), value: formatEth(data.royaltiesWei), formula: t("formula.royalties") },
    { key: "secondary-volume", label: t("secondaryVolume"), value: formatEth(data.secondaryVolumeWei), formula: t("formula.secondaryVolume") },
    { key: "sold", label: t("sold"), value: String(data.soldCount), formula: t("formula.sold") },
    { key: "minted", label: t("minted"), value: String(data.mintedCount), formula: t("formula.minted") },
    { key: "burned", label: t("burned"), value: String(data.burnedCount), formula: t("formula.burned") },
    { key: "occupancy", label: t("occupancy"), value: `${pct} %`, formula: t("formula.occupancy") },
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
      <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {metrics.map((m) => (
          <li
            key={m.key}
            data-testid={`metric-${m.key}`}
            className="rounded-brand-lg border border-line bg-shell p-4 shadow-card"
          >
            <p className="text-small text-ink-soft">{m.label}</p>
            <p className="mt-1 font-display text-h3 font-bold text-ink">{m.value}</p>
            <p className="mt-1 text-micro text-ink-soft">{m.formula}</p>
          </li>
        ))}
      </ul>

      {data.undatedSalesCount > 0 && (
        <p
          data-testid="dashboard-undated"
          role="status"
          className="rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-small text-terracotta-text"
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
