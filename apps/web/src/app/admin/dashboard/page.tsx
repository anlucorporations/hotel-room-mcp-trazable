import type { DashboardAggregates } from "@hotel/shared";
import { NFTsRepository } from "@hotel/shared";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { DegradedState } from "@/components/DegradedState";
import { fetchAggregates } from "@/lib/worker-api";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const nftsRepo = new NFTsRepository();

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  let data: DashboardAggregates | null = null;
  try {
    const metrics = await nftsRepo.getFinancialMetrics();
    data = {
      primaryVolumeWei: metrics.primaryVolumeWei,
      royaltiesWei: metrics.accumulatedRoyaltiesWei,
      secondaryVolumeWei: metrics.secondaryVolumeWei,
      soldCount: metrics.soldCount,
      mintedCount: metrics.mintedCount,
      burnedCount: metrics.burnedCount,
      occupancyRatioPercent: metrics.commercialOccupancyPercent,
      lastBlock: 0,
    };
  } catch {
    try {
      data = await fetchAggregates();
    } catch {
      data = null;
    }
  }

  return (
    <AdminLayout>
      <AdminPanel titleKey="dashboardTitle" descriptionKey="dashboardTagline">
        <div className="mb-4 flex justify-end">
          <a
            href="/api/admin/metrics?format=csv"
            download
            className="inline-flex items-center gap-2 rounded-brand border border-line bg-sand-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-sand"
          >
            <svg
              width="14"
              height="14"
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
            Exportar Informe CSV
          </a>
        </div>
        {data === null ? (
          <DegradedState message={t("degraded")} retryLabel={t("retry")} />
        ) : (
          <DashboardMetrics data={data} />
        )}
      </AdminPanel>
    </AdminLayout>
  );
}

