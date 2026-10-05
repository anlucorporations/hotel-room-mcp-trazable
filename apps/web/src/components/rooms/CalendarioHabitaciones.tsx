"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { isoParts, type BoardDayTotals, type BoardView } from "@/lib/room-board-calendar";
import { MaintenanceIcon, OccupiedIcon, PublishedIcon, ReservedIcon } from "./roomIcons";

/**
 * **CalendarioHabitaciones** (2026-10-04): mapa de disponibilidad del hotel por día, semana, mes o
 * trimestre, reutilizable desde cualquier módulo (administración, recepción, housekeeping,
 * mantenimiento o la web pública).
 *
 * Es un componente **de presentación**: recibe los totales ya agregados (`BoardDayTotals[]`) y avisa
 * de la navegación y de la selección por callbacks. No conoce ni la API ni el contexto del
 * back-office, de modo que pueda montarse en cualquier pantalla; la regla de negocio de qué cuenta
 * cada estado vive en `lib/room-board-calendar.ts` (probada aparte).
 *
 * Accesibilidad (mismo rigor que `RoomCalendar`):
 *   · cada día es un `<button>` con `aria-label` que **enumera los totales en texto**, y cada estado
 *     lleva además un **icono distinto**: el color nunca es la única señal (WCAG 1.4.1);
 *   · el día seleccionado se marca con `aria-pressed`;
 *   · la leyenda repite icono + etiqueta;
 *   · los iconos son decorativos (`aria-hidden`) y el nombre accesible lo da el botón.
 *
 * i18n: las etiquetas viven en el namespace `admin`; los nombres de día y mes se localizan con
 * `Intl.DateTimeFormat` en zona **UTC**, la misma con la que el servidor clasifica los días.
 */

export interface CalendarioHabitacionesProps {
  /** Totales por día, ya agregados y en orden ascendente. */
  readonly days: readonly BoardDayTotals[];
  /** Vista activa. */
  readonly view: BoardView;
  /** Cambio de vista pedido por el usuario. */
  readonly onViewChange?: (view: BoardView) => void;
  /** Desplazamiento del periodo (`-1` anterior, `+1` siguiente). */
  readonly onShift?: (delta: number) => void;
  /** Día seleccionado (`YYYY-MM-DD`). */
  readonly selectedDate?: string | null;
  /** Selección de un día. */
  readonly onSelectDate?: (date: string) => void;
  /** Rótulo del periodo (mes, trimestre…), ya localizado por quien lo use. */
  readonly heading?: string;
  readonly locale?: string;
  readonly className?: string;
}

const VIEWS: readonly BoardView[] = ["DAY", "WEEK", "MONTH", "QUARTER"];

const VIEW_LABEL_KEY: Readonly<Record<BoardView, string>> = {
  DAY: "boardViewDay",
  WEEK: "boardViewWeek",
  MONTH: "boardViewMonth",
  QUARTER: "boardViewQuarter",
};

/** Día de la semana de una fecha ISO (0 = lunes … 6 = domingo). */
function weekdayIndex(iso: string): number {
  const { year, month, day } = isoParts(iso);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** Etiqueta corta del día de la semana en el idioma activo (zona UTC). */
function weekdayLabel(locale: string, index: number): string {
  // 2024-01-01 fue lunes: sirve de ancla para pedir cada día de la semana a Intl.
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
}

/** «5 oct» en el idioma activo (zona UTC). */
function dayLabel(locale: string, iso: string): string {
  const { year, month, day } = isoParts(iso);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** Encabezado de mes en el idioma activo. */
function monthLabel(locale: string, iso: string): string {
  const { year, month } = isoParts(iso);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Agrupa los días por mes conservando el orden (para la vista de trimestre). */
function groupByMonth(days: readonly BoardDayTotals[]): Array<{ key: string; days: BoardDayTotals[] }> {
  const groups: Array<{ key: string; days: BoardDayTotals[] }> = [];
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(day);
    else groups.push({ key, days: [day] });
  }
  return groups;
}

export function CalendarioHabitaciones({
  days,
  view,
  onViewChange,
  onShift,
  selectedDate,
  onSelectDate,
  heading,
  locale = "es",
  className,
}: CalendarioHabitacionesProps) {
  const t = useTranslations("admin");

  /** Estados de un día con su icono, etiqueta y token de color. */
  const statesOf = (day: BoardDayTotals) => [
    { key: "published", count: day.published, Icon: PublishedIcon, label: t("boardLegendPublished"), tone: "text-success" },
    { key: "reserved", count: day.reserved, Icon: ReservedIcon, label: t("boardLegendReserved"), tone: "text-info" },
    { key: "occupied", count: day.occupied, Icon: OccupiedIcon, label: t("boardLegendOccupied"), tone: "text-ink-soft" },
    { key: "maintenance", count: day.maintenance, Icon: MaintenanceIcon, label: t("boardLegendMaintenance"), tone: "text-warning" },
  ];

  /** Nombre accesible del día: enumera los totales en texto (el color nunca es la única señal). */
  const ariaFor = (day: BoardDayTotals): string =>
    t("boardDayAria", {
      date: dayLabel(locale, day.date),
      published: day.published,
      reserved: day.reserved,
      occupied: day.occupied,
      maintenance: day.maintenance,
    });

  const renderDay = (day: BoardDayTotals) => {
    const selected = selectedDate === day.date;
    return (
      <button
        key={day.date}
        type="button"
        data-testid={`board-day-${day.date}`}
        onClick={() => onSelectDate?.(day.date)}
        aria-pressed={selected}
        aria-label={ariaFor(day)}
        className={`flex min-h-touch flex-col gap-1 rounded-brand border p-2 text-left transition-colors ${
          selected ? "border-azure bg-azure/10" : "border-line bg-shell hover:bg-mist-2"
        }`}
      >
        <span className="text-small font-semibold text-ink">{dayLabel(locale, day.date)}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {statesOf(day)
            .filter((state) => state.count > 0)
            .map(({ key, count, Icon, label, tone }) => (
              <span key={key} className={`inline-flex items-center gap-0.5 ${tone}`} title={`${label}: ${count}`}>
                <Icon size={13} />
                <span className="text-small font-semibold">{count}</span>
              </span>
            ))}
          {day.withActivity === 0 && <span className="text-small text-ink-soft">{t("boardNoActivity")}</span>}
        </span>
      </button>
    );
  };

  const firstDay = days.length > 0 ? days[0] : undefined;
  const leadingBlanks = firstDay && view !== "DAY" ? weekdayIndex(firstDay.date) : 0;

  return (
    <section
      data-testid="calendario-habitaciones"
      className={`flex flex-col gap-3 ${className ?? ""}`}
      aria-label={t("boardCalendarLabel")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("boardViewGroup")}>
          {VIEWS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-testid={`board-view-${candidate.toLowerCase()}`}
              onClick={() => onViewChange?.(candidate)}
              aria-pressed={view === candidate}
              className={`min-h-touch rounded-pill border px-3 text-small font-medium transition-colors ${
                view === candidate ? "border-azure bg-azure text-shell" : "border-line text-ink hover:bg-mist-2"
              }`}
            >
              {t(VIEW_LABEL_KEY[candidate])}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="board-prev"
            onClick={() => onShift?.(-1)}
            aria-label={t("boardPrev")}
            title={t("boardPrev")}
            className="min-h-touch rounded-pill border border-line px-3 text-small text-ink transition-colors hover:bg-mist-2"
          >
            ‹
          </button>
          {heading && (
            <span data-testid="board-heading" className="px-2 text-small font-semibold capitalize text-ink">
              {heading}
            </span>
          )}
          <button
            type="button"
            data-testid="board-next"
            onClick={() => onShift?.(1)}
            aria-label={t("boardNext")}
            title={t("boardNext")}
            className="min-h-touch rounded-pill border border-line px-3 text-small text-ink transition-colors hover:bg-mist-2"
          >
            ›
          </button>
        </div>
      </div>

      {days.length === 0 ? (
        <p role="status" className="text-ink-soft">
          {t("boardEmpty")}
        </p>
      ) : view === "DAY" ? (
        <div className="rounded-brand border border-line bg-shell p-3">{firstDay ? renderDay(firstDay) : null}</div>
      ) : view === "QUARTER" ? (
        <div className="flex flex-col gap-4">
          {groupByMonth(days).map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <h3 className="text-small font-semibold capitalize text-ink-soft">
                {monthLabel(locale, `${group.key}-01`)}
              </h3>
              <div className="grid grid-cols-7 gap-1">{gridOf(group.days, group.days[0] ? weekdayIndex(group.days[0].date) : 0, renderDay)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-small font-medium text-ink-soft">
            {[0, 1, 2, 3, 4, 5, 6].map((index) => (
              <span key={index} className="px-2">
                {weekdayLabel(locale, index)}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">{gridOf(days, leadingBlanks, renderDay)}</div>
        </div>
      )}

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-soft">
        {(
          [
            { Icon: PublishedIcon, label: t("boardLegendPublished"), tone: "text-success" },
            { Icon: ReservedIcon, label: t("boardLegendReserved"), tone: "text-info" },
            { Icon: OccupiedIcon, label: t("boardLegendOccupied"), tone: "text-ink-soft" },
            { Icon: MaintenanceIcon, label: t("boardLegendMaintenance"), tone: "text-warning" },
          ] as const
        ).map(({ Icon, label, tone }) => (
          <li key={label} className="inline-flex items-center gap-1">
            <span className={tone}>
              <Icon size={14} />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rejilla de 7 columnas: huecos de alineación + celdas de día. */
function gridOf(
  days: readonly BoardDayTotals[],
  blanks: number,
  renderDay: (day: BoardDayTotals) => ReactNode,
): ReactNode[] {
  const cells: ReactNode[] = [];
  for (let index = 0; index < blanks; index += 1) {
    cells.push(<span key={`blank-${index}`} aria-hidden="true" />);
  }
  for (const day of days) cells.push(renderDay(day));
  return cells;
}
