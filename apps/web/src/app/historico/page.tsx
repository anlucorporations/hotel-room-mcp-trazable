import { getTranslations } from "next-intl/server";
import type { SaleHistoryEntry } from "@hotel/shared";
import { DegradedState } from "@/components/DegradedState";
import { HistoryTable } from "@/components/history/HistoryTable";
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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-slate-600">{t("tagline")}</p>
      </header>
      {entries === null ? (
        <DegradedState message={t("degraded")} retryLabel={t("retry")} />
      ) : (
        <HistoryTable entries={entries} />
      )}
    </main>
  );
}
