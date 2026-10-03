"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildMonthGrid,
  classifyDay,
  countMonthDays,
  isoDayOf,
  monthOfIsoDate,
  shiftMonth,
  type RoomCalendarDay,
  type RoomCalendarMonthRef,
  type RoomCalendarState,
  type RoomPublicationWindow,
} from "@/lib/room-calendar";

/**
 * **Calendario mensual de publicaciones y ocupación** de una habitación (2026-10-02).
 *
 * Es un componente de presentación puro: recibe las ventanas de publicación y las noches
 * reservadas por props y no conoce ni el contexto del back-office ni la API, de modo que pueda
 * montarse desde administración, recepción, housekeeping, mantenimiento o la web pública.
 *
 * Cada día se clasifica en cuatro estados (`PUBLICADA`, `RESERVADA`, `AMBAS`, `LIBRE`) y el estado
 * **nunca se comunica solo con color**:
 *   - cada día lleva un **símbolo** con forma distinta (● ▲ ◆ ○) y `aria-label` con su fecha y su
 *     estado,
 *   - la leyenda repite símbolo + etiqueta en texto,
 *   - el resumen `role="status"` anuncia cuántos días publicados y reservados tiene el mes.
 *
 * La semana empieza en **lunes** y el mes y los días se localizan con `Intl.DateTimeFormat` en la
 * zona **UTC** (la misma con la que se clasifican los días), para que no haya saltos de día por la
 * zona horaria de quien mira.
 */

export interface RoomCalendarProps {
  /** Ventanas en las que la ficha estuvo publicada. */
  readonly publications: readonly RoomPublicationWindow[];
  /** Noches ocupadas (`YYYY-MM-DD`). */
  readonly reservedNights: readonly string[];
  /** Idioma activo (`es` | `en` | `ru`). Por defecto `es`. */
  readonly locale?: string;
  /** Mes inicial (`YYYY-MM-DD`); si falta, se deduce de `window` o de la primera publicación. */
  readonly initialMonth?: string | null;
  /** Ventana de datos disponible; solo decide el mes inicial cuando no se fija `initialMonth`. */
  readonly window?: { readonly from: string; readonly to: string } | null;
  readonly className?: string;
}

/** Clases de cada estado. Medidas de contraste verificadas en `a11y.test.ts`. */
const STATE_CLASS: Readonly<Record<RoomCalendarState, string>> = {
  PUBLICADA: "border-azure bg-azure/15 text-azure-deep",
  RESERVADA: "border-coral bg-coral/15 text-coral-text",
  AMBAS: "border-navy bg-navy text-mist",
  LIBRE: "border-line bg-shell text-ink-soft",
};

/** Símbolo de cada estado: segunda señal, independiente del color. */
const STATE_SYMBOL: Readonly<Record<RoomCalendarState, string>> = {
  PUBLICADA: "●",
  RESERVADA: "▲",
  AMBAS: "◆",
  LIBRE: "○",
};

const NAV_BUTTON_CLASS =
  "inline-flex min-h-touch min-w-touch items-center justify-center rounded-pill border border-line-strong bg-shell text-ink transition-colors hover:bg-mist-2";

const CHIP_CLASS = "inline-flex h-5 w-5 items-center justify-center rounded-brand-xs border text-micro";

const DAYS_PER_WEEK = 7;

/** Mes en el que abrir el calendario: el pedido, el de la ventana o el de la primera publicación. */
function resolveInitialMonth(
  initialMonth: string | null | undefined,
  availableWindow: { readonly from: string; readonly to: string } | null | undefined,
  publications: readonly RoomPublicationWindow[],
): RoomCalendarMonthRef {
  const publishedDays = publications
    .map((publication) => isoDayOf(publication.publishedAt))
    .filter((day) => day !== "")
    .sort();
  const candidates = [initialMonth, availableWindow?.from, publishedDays[0]];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const month = monthOfIsoDate(candidate);
    if (month !== null) return month;
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Primera letra en mayúscula (los datos de Intl no vienen capitalizados). */
function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

export function RoomCalendar({
  publications,
  reservedNights,
  locale = "es",
  initialMonth = null,
  window: availableWindow = null,
  className = "",
}: RoomCalendarProps) {
  const t = useTranslations("admin");
  const [cursor, setCursor] = useState<RoomCalendarMonthRef>(() =>
    resolveInitialMonth(initialMonth, availableWindow, publications),
  );

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const counts = useMemo(
    () => countMonthDays(cursor.year, cursor.month, publications, reservedNights),
    [cursor, publications, reservedNights],
  );

  const weeks = useMemo(() => {
    const chunks: RoomCalendarDay[][] = [];
    for (let index = 0; index < days.length; index += DAYS_PER_WEEK) {
      chunks.push(days.slice(index, index + DAYS_PER_WEEK));
    }
    return chunks;
  }, [days]);

  const monthLabel = useMemo(
    () =>
      capitalizeFirst(
        new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(Date.UTC(cursor.year, cursor.month - 1, 1)),
        ),
      ),
    [cursor, locale],
  );

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // 2024-01-01 fue lunes: ancla para rotular la semana que empieza en lunes.
    return Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
      capitalizeFirst(formatter.format(new Date(Date.UTC(2024, 0, 1 + index)))),
    );
  }, [locale]);

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );

  const legend = useMemo(
    () => [
      { state: "PUBLICADA" as const, label: t("roomCalendarLegendPublished") },
      { state: "RESERVADA" as const, label: t("roomCalendarLegendReserved") },
      { state: "AMBAS" as const, label: t("roomCalendarLegendBoth") },
      { state: "LIBRE" as const, label: t("roomCalendarLegendFree") },
    ],
    [t],
  );

  return (
    <div className={`rounded-brand-lg border border-line bg-shell p-4 shadow-card ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((current) => shiftMonth(current.year, current.month, -1))}
          aria-label={t("roomCalendarPrev")}
          className={NAV_BUTTON_CLASS}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <p className="text-h4 font-semibold text-navy">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor((current) => shiftMonth(current.year, current.month, 1))}
          aria-label={t("roomCalendarNext")}
          className={NAV_BUTTON_CLASS}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <table className="mt-3 w-full table-fixed border-collapse">
        <caption className="sr-only">{`${t("roomCalendarTitle")} · ${monthLabel}`}</caption>
        <thead>
          <tr>
            {weekdayLabels.map((label) => (
              <th
                key={label}
                scope="col"
                className="border-b border-line px-1 pb-2 text-caption font-semibold text-ink-soft"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.date ?? "week"}>
              {week.map((cell) => {
                const state = classifyDay(cell.date, publications, reservedNights);
                const stateLabel = legend.find((item) => item.state === state)?.label ?? "";
                return (
                  <td key={cell.date} className="p-0.5 align-top">
                    {/* Los días de los meses vecinos se distinguen con **borde discontinuo**, no con
                        opacidad: `opacity-60` mezclaba el texto con el fondo y dejaba el día en
                        2,87:1 (lo destapó el escaneo axe del ciclo, 2026-10-02). El borde es además
                        una señal que no depende del color (WCAG 1.4.1). */}
                    <button
                      type="button"
                      aria-label={`${dayFormatter.format(new Date(`${cell.date}T00:00:00.000Z`))}: ${stateLabel}`}
                      className={`flex h-full min-h-touch w-full flex-col items-center justify-center gap-0.5 rounded-brand-sm border px-1 py-1 text-caption font-semibold transition-colors ${
                        STATE_CLASS[state]
                      } ${cell.inMonth ? "" : "border-dashed"}`.trim()}
                    >
                      <span aria-hidden="true">{cell.day}</span>
                      <span aria-hidden="true" className="text-micro leading-none">
                        {STATE_SYMBOL[state]}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {legend.map(({ state, label }) => (
          <li key={state} className="flex items-center gap-1.5 text-micro text-ink-soft">
            <span aria-hidden="true" className={`${CHIP_CLASS} ${STATE_CLASS[state]}`}>
              {STATE_SYMBOL[state]}
            </span>
            {label}
          </li>
        ))}
      </ul>

      <p role="status" className="mt-3 text-small text-ink">
        {t("roomCalendarPublishedDays", { count: counts.published })} ·{" "}
        {t("roomCalendarReservedDays", { count: counts.reserved })}
      </p>
    </div>
  );
}
