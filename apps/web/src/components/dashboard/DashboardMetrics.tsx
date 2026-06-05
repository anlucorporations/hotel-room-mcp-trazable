import { useTranslations } from "next-intl";
import { formatEther } from "viem";
import type { DashboardAggregates } from "@hotel/shared";
import { formatEth } from "@/lib/format";

interface Metric {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly formula: string;
  /** Magnitud numérica para la mini-barra comparativa (no es serie temporal). */
  readonly magnitude: number;
}

/**
 * Mini-barra comparativa (SVG inline) escalada al máximo del grupo. Los agregados son escalares
 * (sin serie temporal en `DashboardAggregates`): en lugar de inventar datos falsos, mostramos
 * la magnitud relativa de la métrica frente al resto. Accesible vía `role="img"` + `aria-label`.
 */
function MiniBar({ magnitude, max, label }: { magnitude: number; max: number; label: string }) {
  const ratio = max > 0 ? Math.min(1, magnitude / max) : 0;
  const filled = Math.round(ratio * 100);
  return (
    <svg
      viewBox="0 0 100 8"
      width="100%"
      height="8"
      role="img"
      aria-label={label}
      className="mt-3 overflow-visible"
      preserveAspectRatio="none"
    >
      <rect x="0" y="2" width="100" height="4" rx="2" fill="var(--sand-2)" />
      {filled > 0 && <rect x="0" y="2" width={filled} height="4" rx="2" fill="var(--sea)" />}
    </svg>
  );
}

/** Métricas del dashboard (CU-11): cada una con unidad, periodo y mini-barra comparativa. */
export function DashboardMetrics({ data }: { data: DashboardAggregates }) {
  const t = useTranslations("dashboard");

  const pct = Number.isInteger(data.occupancyRatioPercent)
    ? String(data.occupancyRatioPercent)
    : data.occupancyRatioPercent.toFixed(1);

  // Magnitudes en unidades comparables: volúmenes en ETH, conteos tal cual, ocupación en %.
  const toEth = (wei: string): number => Number(formatEther(BigInt(wei)));

  const metrics: readonly Metric[] = [
    { key: "primary-volume", label: t("primaryVolume"), value: formatEth(data.primaryVolumeWei), formula: t("formula.primaryVolume"), magnitude: toEth(data.primaryVolumeWei) },
    { key: "royalties", label: t("royalties"), value: formatEth(data.royaltiesWei), formula: t("formula.royalties"), magnitude: toEth(data.royaltiesWei) },
    { key: "secondary-volume", label: t("secondaryVolume"), value: formatEth(data.secondaryVolumeWei), formula: t("formula.secondaryVolume"), magnitude: toEth(data.secondaryVolumeWei) },
    { key: "sold", label: t("sold"), value: String(data.soldCount), formula: t("formula.sold"), magnitude: data.soldCount },
    { key: "minted", label: t("minted"), value: String(data.mintedCount), formula: t("formula.minted"), magnitude: data.mintedCount },
    { key: "burned", label: t("burned"), value: String(data.burnedCount), formula: t("formula.burned"), magnitude: data.burnedCount },
    { key: "occupancy", label: t("occupancy"), value: `${pct} %`, formula: t("formula.occupancy"), magnitude: data.occupancyRatioPercent },
  ];

  const maxMagnitude = metrics.reduce((m, x) => Math.max(m, x.magnitude), 0);

  return (
    <section className="flex flex-col gap-4">
      <p data-testid="dashboard-period" className="text-small text-ink-soft">
        {t("period", { block: data.lastBlock })}
      </p>
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
            <MiniBar magnitude={m.magnitude} max={maxMagnitude} label={t("sparklineLabel", { label: m.label })} />
          </li>
        ))}
      </ul>
      <p className="text-micro text-ink-soft">{t("sparklineNote")}</p>
    </section>
  );
}
