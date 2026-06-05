import { getTranslations } from "next-intl/server";
import type { DashboardAggregates } from "@hotel/shared";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { DegradedState } from "@/components/DegradedState";
import { fetchAggregates } from "@/lib/worker-api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  let data: DashboardAggregates | null = null;
  try {
    data = await fetchAggregates();
  } catch {
    data = null; // worker no disponible → degradado
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-slate-600">{t("tagline")}</p>
      </header>
      {data === null ? (
        <DegradedState message={t("degraded")} retryLabel={t("retry")} />
      ) : (
        <DashboardMetrics data={data} />
      )}
    </main>
  );
}
