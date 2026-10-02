"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { formatEther } from "viem";
import type { NightType } from "@hotel/shared/domain";
import {
  FilterBar,
  type MonthOption,
  type PriceOption,
} from "@/components/catalog/FilterBar";
import { NightCard } from "@/components/NightCard";
import { ContractPausedBanner } from "@/components/ContractPausedBanner";
import { formatMonthLabel, monthKeyOf } from "@/lib/format";
import type { NightView } from "@/lib/nights";

const PAGE_SIZE = 12;
// Tarjetas con imagen de carga ansiosa (LCP, UX#10): la primera fila de escritorio.
const PRIORITY_CARDS = 3;

interface Filters {
  readonly type: NightType | "all";
  readonly month: number | null;
  /** Umbral de precio máximo en wei; `null` = cualquier precio (RF-14, MINOR#19). */
  readonly maxPriceWei: bigint | null;
  /** Rango de fechas `AAAA-MM-DD` (input nativo); vacío = sin acotar (RF-14). */
  readonly dateFrom: string;
  readonly dateTo: string;
  /** Búsqueda por número de habitación (RF-14). */
  readonly search: string;
}

const NO_FILTERS: Filters = {
  type: "all",
  month: null,
  maxPriceWei: null,
  dateFrom: "",
  dateTo: "",
  search: "",
};

const hasActiveFilters = (f: Filters): boolean =>
  f.type !== "all" ||
  f.month !== null ||
  f.maxPriceWei !== null ||
  f.dateFrom !== "" ||
  f.dateTo !== "" ||
  f.search.trim() !== "";

/** `AAAA-MM-DD` (input date) → entero `AAAAMMDD` comparable; null si está vacío/incompleto. */
function isoToYYYYMMDD(iso: string): number | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return year * 10_000 + month * 100 + day;
}

/** Icono de mapa/brújula para el estado vacío (stroke, docs/SRS.md §7). */
function EmptyIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

/** Catálogo público con filtros completos (RF-14) y paginación load-more (CU-04, docs/SRS.md §9). */
export function CatalogClient({
  nights,
  paused,
}: {
  nights: readonly NightView[];
  /** `true`/`false` = estado leído on-chain; `null` = no se pudo comprobar (M7). */
  paused: boolean | null;
}) {
  const t = useTranslations("catalog");
  const format = useFormatter();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [added, setAdded] = useState(0);
  const firstNewRef = useRef<HTMLLIElement | null>(null);

  // Meses presentes en el catálogo (RF-14): derivados, ordenados y sin duplicados.
  const months: readonly MonthOption[] = useMemo(() => {
    const seen = new Map<number, MonthOption>();
    for (const night of nights) {
      const key = monthKeyOf(night.dateYYYYMMDD);
      if (!seen.has(key)) seen.set(key, { key, label: formatMonthLabel(night.dateYYYYMMDD) });
    }
    return [...seen.values()].sort((a, b) => a.key - b.key);
  }, [nights]);

  // Umbrales de precio máximo derivados del catálogo real (MINOR#19): se calculan a partir del
  // precio máximo presente, redondeando «hacia arriba» a medios ETH, y se etiquetan vía next-intl
  // (origen único; sin literal «Hasta 0,5 ETH» hardcodeado).
  const priceOptions: readonly PriceOption[] = useMemo(() => {
    if (nights.length === 0) return [];
    const maxWei = nights.reduce((acc, n) => {
      const wei = BigInt(n.priceWei);
      return wei > acc ? wei : acc;
    }, 0n);
    const stepWei = 500_000_000_000_000_000n; // medio ETH por escalón
    const options: PriceOption[] = [];
    for (let wei = stepWei; wei < maxWei + stepWei; wei += stepWei) {
      const ethLabel = format.number(Number(formatEther(wei)), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });
      options.push({ wei, label: t("maxPriceOption", { price: ethLabel }) });
    }
    return options;
  }, [nights, format, t]);

  const filtered = useMemo(() => {
    const from = isoToYYYYMMDD(filters.dateFrom);
    const to = isoToYYYYMMDD(filters.dateTo);
    const query = filters.search.trim();
    return nights.filter((night) => {
      if (filters.type !== "all" && night.type !== filters.type) return false;
      if (filters.month !== null && monthKeyOf(night.dateYYYYMMDD) !== filters.month) return false;
      if (filters.maxPriceWei !== null && BigInt(night.priceWei) > filters.maxPriceWei) return false;
      if (from !== null && night.dateYYYYMMDD < from) return false;
      if (to !== null && night.dateYYYYMMDD > to) return false;
      if (query !== "" && !String(night.room).includes(query)) return false;
      return true;
    });
  }, [nights, filters]);

  // Al cambiar cualquier filtro, vuelve a la primera página (un único punto de reseteo).
  const applyFilters = useCallback((compute: (prev: Filters) => Filters) => {
    setFilters((prev) => compute(prev));
    setVisible(PAGE_SIZE);
    setAdded(0);
  }, []);

  const onToggleAll = useCallback(
    () => applyFilters((prev) => ({ ...prev, type: "all", month: null })),
    [applyFilters],
  );
  const onToggleType = useCallback(
    (type: NightType) =>
      applyFilters((prev) => ({ ...prev, type: prev.type === type ? "all" : type })),
    [applyFilters],
  );
  const onToggleMonth = useCallback(
    (monthKey: number) =>
      applyFilters((prev) => ({ ...prev, month: prev.month === monthKey ? null : monthKey })),
    [applyFilters],
  );
  const onMaxPriceChange = useCallback(
    (wei: bigint | null) => applyFilters((prev) => ({ ...prev, maxPriceWei: wei })),
    [applyFilters],
  );
  const onDateFromChange = useCallback(
    (value: string) => applyFilters((prev) => ({ ...prev, dateFrom: value })),
    [applyFilters],
  );
  const onDateToChange = useCallback(
    (value: string) => applyFilters((prev) => ({ ...prev, dateTo: value })),
    [applyFilters],
  );
  const onSearchChange = useCallback(
    (value: string) => applyFilters((prev) => ({ ...prev, search: value })),
    [applyFilters],
  );
  const onClearFilters = useCallback(() => applyFilters(() => NO_FILTERS), [applyFilters]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;
  const firstNewIndex = shown.length - added; // primer elemento de la última tanda añadida
  const filtersActive = hasActiveFilters(filters);

  const onLoadMore = useCallback(() => {
    const before = visible;
    const next = Math.min(before + PAGE_SIZE, filtered.length);
    setVisible(next);
    setAdded(next - before);
    // Foco al primer elemento nuevo tras pintar (RNF-02, gestión de foco).
    requestAnimationFrame(() => firstNewRef.current?.focus());
  }, [visible, filtered.length]);

  return (
    <>
      <FilterBar
        months={months}
        priceOptions={priceOptions}
        type={filters.type}
        month={filters.month}
        maxPriceWei={filters.maxPriceWei}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        search={filters.search}
        resultCount={filtered.length}
        onToggleAll={onToggleAll}
        onToggleType={onToggleType}
        onToggleMonth={onToggleMonth}
        onMaxPriceChange={onMaxPriceChange}
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
        onSearchChange={onSearchChange}
      />

      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        <h2 className="sr-only">{t("sectionHeading")}</h2>

        {/* Estado del contrato (M7): con el contrato en pausa NO se ofrecen compras que revertirían. */}
        <div className="mb-6 empty:hidden">
          <ContractPausedBanner paused={paused} />
        </div>

        {shown.length === 0 ? (
          <div
            data-testid="empty-state"
            role="status"
            className="flex flex-col items-center rounded-brand-lg border border-dashed border-line bg-mist-2 px-5 py-16 text-center"
          >
            <span className="mb-3.5 text-azure opacity-60">
              <EmptyIcon />
            </span>
            {filtersActive ? (
              // Con filtros activos: guía a relajarlos y ofrece «Quitar filtros» (MINOR#15).
              <>
                <h3 className="font-display text-h3 font-semibold">{t("empty")}</h3>
                <p className="mx-auto mt-1.5 max-w-[40ch] text-ink-soft">{t("emptyHint")}</p>
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-5 inline-flex min-h-touch items-center rounded-pill border border-line bg-shell px-5 font-semibold text-ink transition-colors hover:border-azure hover:text-azure"
                >
                  {t("clearFilters")}
                </button>
              </>
            ) : (
              // Sin filtros: el catálogo está realmente vacío; sin botón «Quitar filtros» (MINOR#15).
              <>
                <h3 className="font-display text-h3 font-semibold">{t("emptyNoListings")}</h3>
                <p className="mx-auto mt-1.5 max-w-[40ch] text-ink-soft">{t("emptyNoListingsHint")}</p>
              </>
            )}
          </div>
        ) : (
          <ul
            data-testid="catalog-grid"
            className="grid grid-cols-1 gap-6 tablet:grid-cols-2 tablet:gap-7 desktop:grid-cols-3"
          >
            {shown.map((night, index) => (
              <li
                key={night.tokenId}
                ref={index === firstNewIndex && added > 0 ? firstNewRef : undefined}
                tabIndex={index === firstNewIndex && added > 0 ? -1 : undefined}
                className="outline-none"
              >
                {/* El reveal escalonado solo aplica a la primera tanda (índices < PAGE_SIZE). */}
                <NightCard
                  night={night}
                  revealIndex={added === 0 ? index : undefined}
                  priority={index < PRIORITY_CARDS}
                  paused={paused === true}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Anuncio para lectores de pantalla al cargar más noches (RNF-02). */}
        <p className="sr-only" role="status" aria-live="polite">
          {added > 0 ? t("loadMoreAnnounce", { count: added }) : ""}
        </p>

        {hasMore ? (
          <div className="grid place-items-center pt-9">
            <button
              type="button"
              data-testid="load-more"
              aria-label={t("loadMore")}
              onClick={onLoadMore}
              className="inline-flex min-h-touch min-w-[200px] items-center justify-center rounded-pill border border-line bg-shell px-6 font-semibold text-ink transition-colors hover:border-azure hover:text-azure"
            >
              {t("loadMore")}
            </button>
          </div>
        ) : (
          shown.length > 0 && (
            <p data-testid="end-of-list" role="status" className="pt-7 text-center text-small text-ink-soft">
              {t("endOfList")}
            </p>
          )
        )}
      </div>
    </>
  );
}
