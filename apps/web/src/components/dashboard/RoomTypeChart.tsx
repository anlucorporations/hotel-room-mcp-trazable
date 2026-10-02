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
import type { RoomTypeChartPoint } from "@/lib/dashboard-data";
import { PALETTE } from "@/lib/a11y/palette";
import { ChartFigure } from "./ChartFigure";
import { ChartLegend, SERIES_COLORS } from "./ChartLegend";

/**
 * Desglose del volumen por tipo de habitación (D-16): barras agrupadas primaria/reventa.
 *
 * El rótulo del tipo se resuelve con i18n (`roomType.*`), igual que en el resto de la interfaz;
 * `desconocido` (habitaciones fuera del maestro) tiene su propia etiqueta porque existe de verdad
 * en el histórico y no se debe ocultar.
 */
export function RoomTypeChart({ points }: { points: readonly RoomTypeChartPoint[] }) {
  const t = useTranslations("dashboard");
  const tType = useTranslations("roomType");

  if (points.length === 0) {
    return (
      <p
        data-testid="room-type-empty"
        className="rounded-brand-lg border border-dashed border-line bg-mist-2 px-4 py-6 text-center text-small text-ink-soft"
      >
        {t("charts.roomType.empty")}
      </p>
    );
  }

  const rows = points.map((point) => ({
    ...point,
    label: point.roomType === "desconocido" ? t("charts.roomType.unknown") : tType(point.roomType),
  }));
  const total = rows.reduce((sum, row) => sum + row.totalPol, 0).toFixed(4);

  return (
    <ChartFigure
      id="chart-room-type"
      title={t("charts.roomType.title")}
      description={t("charts.roomType.description")}
      summary={t("charts.roomType.summary", { count: rows.length, total })}
      tableCaption={t("charts.roomType.tableCaption")}
      tableHeaders={[
        t("charts.roomType.colType"),
        t("charts.roomType.colPrimary"),
        t("charts.roomType.colSecondary"),
        t("charts.roomType.colTotal"),
      ]}
      tableRows={rows.map((row) => [row.label, row.primaryLabel, row.secondaryLabel, row.totalLabel])}
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
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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
