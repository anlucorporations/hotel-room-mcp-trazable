import { getTranslations } from "next-intl/server";
import type { SaleHistoryEntry } from "@hotel/shared";
import { DegradedState } from "@/components/DegradedState";
import { HistoryTable } from "@/components/history/HistoryTable";
import { PublicShell } from "@/components/layout/PublicShell";
import { fetchHistory } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

export default async function HistoricoPage() {
  const t = await getTranslations("history");

  let entries: SaleHistoryEntry[] | null = null;
  try {
    entries = await fetchHistory();
  } catch {
    entries = null; // worker no disponible → degradado
  }

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10">
        <header>
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-body text-ink-soft">{t("tagline")}</p>
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
