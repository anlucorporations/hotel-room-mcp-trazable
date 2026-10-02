"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyChartPoint } from "@/lib/dashboard-data";
import { PALETTE } from "@/lib/a11y/palette";
import { ChartFigure } from "./ChartFigure";
import { ChartLegend, SERIES_COLORS } from "./ChartLegend";

/**
 * Serie mensual de ventas (D-16): barras agrupadas de volumen primario y de reventa por mes.
 *
 * Accesibilidad (D-11): la gráfica va dentro de `ChartFigure`, que aporta `role="img"` con nombre
 * accesible y la tabla de datos equivalente. El color no es el único canal: cada serie tiene su
 * nombre en texto (leyenda HTML, no SVG) y el eje Y lleva rótulo de unidad.
 */
export function MonthlySalesChart({ points }: { points: readonly MonthlyChartPoint[] }) {
  const t = useTranslations("dashboard");

  if (points.length === 0) {
    return (
      <p
        data-testid="monthly-empty"
        className="rounded-brand-lg border border-dashed border-line bg-mist-2 px-4 py-6 text-center text-small text-ink-soft"
      >
        {t("charts.monthly.empty")}
      </p>
    );
  }

  const totalLabel = points
    .reduce((sum, point) => sum + point.primaryPol + point.secondaryPol, 0)
    .toFixed(4);

  return (
    <ChartFigure
      id="chart-monthly"
      title={t("charts.monthly.title")}
      description={t("charts.monthly.description")}
      summary={t("charts.monthly.summary", { count: points.length, total: totalLabel })}
      tableCaption={t("charts.monthly.tableCaption")}
      tableHeaders={[
        t("charts.monthly.colMonth"),
        t("charts.monthly.colPrimary"),
        t("charts.monthly.colSecondary"),
        t("charts.monthly.colSales"),
      ]}
      tableRows={points.map((point) => [
        point.label,
        point.primaryLabel,
        point.secondaryLabel,
        `${point.primarySales + point.secondarySales}`,
      ])}
      legend={
        <ChartLegend
          items={[
            { label: t("legend.primary"), color: SERIES_COLORS.primary },
            { label: t("legend.secondary"), color: SERIES_COLORS.secondary },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...points]} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={PALETTE.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={PALETTE["ink-soft"]} tick={{ fontSize: 12 }} />
          <YAxis
            stroke={PALETTE["ink-soft"]}
            tick={{ fontSize: 12 }}
            label={{
              value: t("axis.volume"),
              angle: -90,
              position: "insideLeft",
              fill: PALETTE["ink-soft"],
              fontSize: 12,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: PALETTE.shell,
              border: `1px solid ${PALETTE.line}`,
              color: PALETTE.ink,
            }}
          />
          <Bar
            dataKey="primaryPol"
            name={t("legend.primary")}
            fill={SERIES_COLORS.primary}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="secondaryPol"
            name={t("legend.secondary")}
            fill={SERIES_COLORS.secondary}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
