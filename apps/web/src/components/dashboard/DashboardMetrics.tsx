import { useTranslations } from "next-intl";
import type { DashboardAggregates } from "@hotel/shared";
import { formatEth } from "@/lib/format";

/** Métricas del dashboard (CU-11): cada una con unidad y periodo; ratio sin NaN. */
export function DashboardMetrics({ data }: { data: DashboardAggregates }) {
  const t = useTranslations("dashboard");

  const pct = Number.isInteger(data.occupancyRatioPercent)
    ? String(data.occupancyRatioPercent)
    : data.occupancyRatioPercent.toFixed(1);

  const metrics: ReadonlyArray<{ key: string; label: string; value: string; formula: string }> = [
    { key: "primary-volume", label: t("primaryVolume"), value: formatEth(data.primaryVolumeWei), formula: t("formula.primaryVolume") },
    { key: "royalties", label: t("royalties"), value: formatEth(data.royaltiesWei), formula: t("formula.royalties") },
    { key: "secondary-volume", label: t("secondaryVolume"), value: formatEth(data.secondaryVolumeWei), formula: t("formula.secondaryVolume") },
    { key: "sold", label: t("sold"), value: String(data.soldCount), formula: t("formula.sold") },
    { key: "minted", label: t("minted"), value: String(data.mintedCount), formula: t("formula.minted") },
    { key: "burned", label: t("burned"), value: String(data.burnedCount), formula: t("formula.burned") },
    { key: "occupancy", label: t("occupancy"), value: `${pct} %`, formula: t("formula.occupancy") },
  ];

  return (
    <section className="flex flex-col gap-4">
      <p data-testid="dashboard-period" className="text-sm text-slate-500">
        {t("period", { block: data.lastBlock })}
      </p>
      <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {metrics.map((m) => (
          <li
            key={m.key}
            data-testid={`metric-${m.key}`}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <p className="text-sm text-slate-500">{m.label}</p>
            <p className="mt-1 text-2xl font-bold">{m.value}</p>
            <p className="mt-1 text-xs text-slate-400">{m.formula}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
