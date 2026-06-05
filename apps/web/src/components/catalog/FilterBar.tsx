"use client";

import { useTranslations } from "next-intl";
import type { NightType } from "@hotel/shared";
import { TYPE_LABEL } from "@/lib/format";

/** Mes disponible en el catálogo (clave `AAAAMM` + etiqueta editorial). */
export interface MonthOption {
  readonly key: number;
  readonly label: string;
}

export interface FilterBarProps {
  readonly months: readonly MonthOption[];
  readonly type: NightType | "all";
  readonly month: number | null;
  readonly maxPrice: boolean;
  readonly resultCount: number;
  readonly onToggleAll: () => void;
  readonly onToggleType: (type: NightType) => void;
  readonly onToggleMonth: (monthKey: number) => void;
  readonly onTogglePrice: () => void;
}

const TYPES: readonly NightType[] = ["simple", "doble", "suite"];

const CHIP_BASE =
  "inline-flex min-h-touch flex-none items-center gap-2 whitespace-nowrap rounded-pill border px-4 text-small font-semibold transition-colors";
const CHIP_ON = "border-sea bg-sea text-shell";
const CHIP_OFF = "border-line bg-shell text-ink-soft hover:border-sea hover:text-sea";

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
 * Barra de filtros por chips toggle accesibles (DISEÑO-UX §3/§4.1, RF-14): tipo de
 * habitación, mes (deriva los meses presentes) y precio. Scroll horizontal en móvil y
 * contador de resultados con `aria-live`. El estado vive en `CatalogClient`.
 */
export function FilterBar({
  months,
  type,
  month,
  maxPrice,
  resultCount,
  onToggleAll,
  onToggleType,
  onToggleMonth,
  onTogglePrice,
}: FilterBarProps) {
  const t = useTranslations("catalog");
  const noFilters = type === "all" && month === null && !maxPrice;

  return (
    <section aria-label={t("filtersLabel")} className="sticky top-[68px] z-30 border-b border-line bg-sand/90 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5">
        <div
          role="group"
          aria-label={t("filtersGroupLabel")}
          className="flex flex-1 gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Chip pressed={noFilters} onClick={onToggleAll}>
            {t("filterAll")}
          </Chip>
          {TYPES.map((value) => (
            <Chip key={value} pressed={type === value} onClick={() => onToggleType(value)}>
              {TYPE_LABEL[value]}
            </Chip>
          ))}
          {months.map((option) => (
            <Chip key={option.key} pressed={month === option.key} onClick={() => onToggleMonth(option.key)}>
              {option.label}
            </Chip>
          ))}
          <Chip pressed={maxPrice} onClick={onTogglePrice}>
            {t("filterMaxPrice")}
          </Chip>
        </div>
        <p
          data-testid="result-count"
          aria-live="polite"
          className="flex-none self-center pl-3 text-small text-ink-soft"
        >
          {t("resultCount", { count: resultCount })}
        </p>
      </div>
    </section>
  );
}
