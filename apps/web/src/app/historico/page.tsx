import { getTranslations } from "next-intl/server";
import type { SaleHistoryEntry } from "@hotel/shared/domain";
import { DegradedState } from "@/components/DegradedState";
import { HistoryTable } from "@/components/history/HistoryTable";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchHistory } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

/**
 * Histórico público (CU-09, docs/SRS.md §9).
 *
 * Lee del worker —la MISMA fuente que el dashboard (D-16)— y no del índice propio: hasta M7 esta
 * página prefería `nftsRepo.getSalesHistory()` (tabla `sale_events`, escrita por el listener) y
 * solo caía al worker si aquello venía vacío. Eran dos caminos para el mismo histórico, cada uno
 * con su checkpoint, así que podían mostrar cifras distintas: exactamente lo que el criterio de
 * aceptación de M7 («las cifras del dashboard cuadran con el histórico») prohíbe.
 */
export default async function HistoricoPage() {
  const t = await getTranslations("history");

  let entries: SaleHistoryEntry[] | null = null;
  try {
    entries = await fetchHistory();
  } catch {
    entries = null; // worker caído → estado degradado honesto
  }

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-body text-ink-soft">{t("tagline")}</p>
          </div>
          <a
            href="/api/sales/history?format=csv"
            download
            className="inline-flex items-center justify-center gap-2 rounded-brand border border-line bg-shell px-4 py-2 text-small font-semibold text-ink shadow-sm transition hover:bg-sand-2 focus:outline-none focus:ring-2 focus:ring-sea"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exportar CSV
          </a>
        </header>
        {entries === null ? (
          <DegradedState message={t("degraded")} retryLabel={t("retry")} />
        ) : (
          <HistoryTable entries={entries} />
        )}
      </div>
    </PublicShell>
  );
}

