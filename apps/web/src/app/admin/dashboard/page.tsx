import type { DashboardAggregates } from "@hotel/shared";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { DegradedState } from "@/components/DegradedState";
import { currentAdminSession } from "@/lib/admin-session";
import { fetchAggregates } from "@/lib/worker-api";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * Dashboard (CU-11 + D-16, docs/SRS.md §9).
 *
 * Fuente ÚNICA: los agregados que el worker calcula en PostgreSQL (`/aggregates`), los mismos que
 * alimentan el histórico público. Hasta M7 esta página prefería un cálculo propio desde
 * `sale_events`/`nfts` y solo caía al worker si aquel fallaba: dos verdades para la misma cifra.
 * Ahora, si el worker no responde, la página lo dice (estado degradado) en vez de mostrar una
 * cifra que quizá no cuadre con el histórico.
 *
 * **Sesión verificada ANTES de leer nada** (M7 · H1): en el App Router la página se renderiza
 * aunque el layout decida no pintarla, así que sin esta comprobación el payload con las cifras
 * viajaba en el flujo RSC a un cliente anónimo. Ver `@/lib/admin-session`.
 */
export default async function DashboardPage() {
  const session = await currentAdminSession();
  if (!session.ok) return <AdminSignInScreen />;

  const t = await getTranslations("dashboard");

  let data: DashboardAggregates | null = null;
  try {
    data = await fetchAggregates();
  } catch {
    data = null;
  }

  return (
    <AdminLayout>
      <AdminPanel titleKey="dashboardTitle" descriptionKey="dashboardTagline">
        <div className="mb-4 flex justify-end">
          <a
            href="/api/admin/metrics?format=csv"
            download
            className="inline-flex min-h-touch items-center gap-2 rounded-brand border border-line bg-sand-2 px-3 text-micro font-semibold text-ink transition hover:bg-sand"
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
            {t("exportCsv")}
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
