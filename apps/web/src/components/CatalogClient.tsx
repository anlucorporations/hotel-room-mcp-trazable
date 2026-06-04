"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { NightType } from "@hotel/shared";
import { NightCard } from "@/components/NightCard";
import { TYPE_LABEL } from "@/lib/format";
import type { NightView } from "@/lib/nights";

const PAGE_SIZE = 12;
const TYPES: readonly NightType[] = ["simple", "doble", "suite"];

/** Catálogo público con filtros y paginación load-more (CU-04, RF-14). */
export function CatalogClient({ nights }: { nights: readonly NightView[] }) {
  const t = useTranslations("catalog");
  const [type, setType] = useState<NightType | "all">("all");
  const [maxPriceEth, setMaxPriceEth] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    // RF-14: el filtro de precio no admite 0 (se ignora un valor ≤ 0).
    const maxWei =
      Number(maxPriceEth) > 0 ? BigInt(Math.round(Number(maxPriceEth) * 1e18)) : null;
    return nights.filter((night) => {
      if (type !== "all" && night.type !== type) return false;
      if (maxWei !== null && BigInt(night.priceWei) > maxWei) return false;
      return true;
    });
  }, [nights, type, maxPriceEth]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          {t("filterType")}
          <select
            data-testid="filter-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as NightType | "all");
              setVisible(PAGE_SIZE);
            }}
            className="mt-1 min-h-touch rounded-md border border-slate-300 px-3"
          >
            <option value="all">{t("filterAll")}</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          {t("filterMaxPrice")}
          <input
            data-testid="filter-max-price"
            type="number"
            min="0"
            step="0.01"
            value={maxPriceEth}
            onChange={(e) => {
              setMaxPriceEth(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="mt-1 min-h-touch rounded-md border border-slate-300 px-3"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p data-testid="empty-state" className="rounded-md bg-slate-50 px-4 py-10 text-center text-slate-500">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
          {shown.map((night) => (
            <li key={night.tokenId}>
              <NightCard night={night} />
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <button
          type="button"
          data-testid="load-more"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="min-h-touch self-center rounded-md border border-slate-300 px-6 py-2 font-medium"
        >
          {t("loadMore")}
        </button>
      ) : (
        shown.length > 0 && (
          <p data-testid="end-of-list" className="text-center text-sm text-slate-400">
            {t("endOfList")}
          </p>
        )
      )}
    </section>
  );
}
