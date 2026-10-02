"use client";

import { useTranslations } from "next-intl";
import type { NightType } from "@hotel/shared/domain";
import { TYPE_LABEL } from "@/lib/format";

/** Mes disponible en el catálogo (clave `AAAAMM` + etiqueta editorial). */
export interface MonthOption {
  readonly key: number;
  readonly label: string;
}

/** Opción del selector de precio máximo (umbral en wei + etiqueta ya formateada). */
export interface PriceOption {
  readonly wei: bigint;
  readonly label: string;
}

export interface FilterBarProps {
  readonly months: readonly MonthOption[];
  readonly priceOptions: readonly PriceOption[];
  readonly type: NightType | "all";
  readonly month: number | null;
  readonly maxPriceWei: bigint | null;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly search: string;
  readonly resultCount: number;
  readonly onToggleAll: () => void;
  readonly onToggleType: (type: NightType) => void;
  readonly onToggleMonth: (monthKey: number) => void;
  readonly onMaxPriceChange: (wei: bigint | null) => void;
  readonly onDateFromChange: (value: string) => void;
  readonly onDateToChange: (value: string) => void;
  readonly onSearchChange: (value: string) => void;
}

const TYPES: readonly NightType[] = ["simple", "doble", "suite"];

const CHIP_BASE =
  "inline-flex min-h-touch flex-none items-center gap-2 whitespace-nowrap rounded-pill border px-4 text-small font-semibold transition-colors";
const CHIP_ON = "border-azure bg-azure text-shell";
const CHIP_OFF = "border-line bg-shell text-ink-soft hover:border-azure hover:text-azure";

const CONTROL_BASE =
  "min-h-touch rounded-pill border border-line bg-shell px-4 text-small text-ink transition-colors focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/40";

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}
    >
      {children}
    </button>
  );
}

/**
 * Barra de filtros del catálogo (docs/SRS.md §7, RF-14). Fila de chips toggle accesibles
 * (tipo de habitación y mes) más una fila de controles completos: buscador por nº de
 * habitación, selector de precio máximo (umbral i18n, MINOR#19) y rango de fechas «desde/hasta».
 * Contador de resultados con `aria-live`. Todo el estado vive en `CatalogClient` (useMemo).
 */
export function FilterBar({
  months,
  priceOptions,
  type,
  month,
  maxPriceWei,
  dateFrom,
  dateTo,
  search,
  resultCount,
  onToggleAll,
  onToggleType,
  onToggleMonth,
  onMaxPriceChange,
  onDateFromChange,
  onDateToChange,
  onSearchChange,
}: FilterBarProps) {
  const t = useTranslations("catalog");
  const allSelected = type === "all" && month === null;

  return (
    <section
      aria-label={t("filtersLabel")}
      className="sticky top-[68px] z-30 border-b border-line bg-mist/90 py-4 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5">
        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label={t("filtersGroupLabel")}
            className="flex flex-1 gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <Chip pressed={allSelected} onClick={onToggleAll}>
              {t("filterAll")}
            </Chip>
            {TYPES.map((value) => (
              <Chip key={value} pressed={type === value} onClick={() => onToggleType(value)}>
                {TYPE_LABEL[value]}
              </Chip>
            ))}
            {months.map((option) => (
              <Chip
                key={option.key}
                pressed={month === option.key}
                onClick={() => onToggleMonth(option.key)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p
            data-testid="result-count"
            aria-live="polite"
            className="flex-none self-center pl-3 text-small text-ink-soft"
          >
            {t("resultCount", { count: resultCount })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1 text-micro font-semibold uppercase tracking-wider text-ink-soft">
            {t("searchLabel")}
            <input
              type="search"
              inputMode="numeric"
              data-testid="filter-search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              className={`${CONTROL_BASE} w-40 font-normal normal-case tracking-normal`}
            />
          </label>

          <label className="flex flex-col gap-1 text-micro font-semibold uppercase tracking-wider text-ink-soft">
            {t("maxPriceLabel")}
            <select
              data-testid="filter-max-price"
              value={maxPriceWei === null ? "" : maxPriceWei.toString()}
              onChange={(event) =>
                onMaxPriceChange(event.target.value === "" ? null : BigInt(event.target.value))
              }
              aria-label={t("maxPriceLabel")}
              className={`${CONTROL_BASE} w-44 font-normal normal-case tracking-normal`}
            >
              <option value="">{t("maxPriceAny")}</option>
              {priceOptions.map((option) => (
                <option key={option.wei.toString()} value={option.wei.toString()}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex items-end gap-2 border-0 p-0">
            <legend className="sr-only">{t("dateRangeLabel")}</legend>
            <label className="flex flex-col gap-1 text-micro font-semibold uppercase tracking-wider text-ink-soft">
              {t("dateFromLabel")}
              <input
                type="date"
                data-testid="filter-date-from"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => onDateFromChange(event.target.value)}
                aria-label={t("dateFromLabel")}
                className={`${CONTROL_BASE} font-normal normal-case tracking-normal`}
              />
            </label>
            <label className="flex flex-col gap-1 text-micro font-semibold uppercase tracking-wider text-ink-soft">
              {t("dateToLabel")}
              <input
                type="date"
                data-testid="filter-date-to"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => onDateToChange(event.target.value)}
                aria-label={t("dateToLabel")}
                className={`${CONTROL_BASE} font-normal normal-case tracking-normal`}
              />
            </label>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
