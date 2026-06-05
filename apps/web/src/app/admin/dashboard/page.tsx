import { cookies } from "next/headers";
import type { DashboardAggregates } from "@hotel/shared";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { DegradedState } from "@/components/DegradedState";
import { fetchAggregates } from "@/lib/worker-api";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * Métricas (CU-11): gateadas por sesión válida (visor) dentro del back-office; ya NO públicas.
 * Los datos se agregan en el worker (server-side). El fetch se hace SOLO con sesión verificada
 * en servidor: una petición no autenticada nunca lleva los agregados en el payload RSC.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  const session = verifySession(cookies().get(SESSION_COOKIE)?.value);
  let data: DashboardAggregates | null = null;
  if (session) {
    try {
      data = await fetchAggregates();
    } catch {
      data = null; // worker no disponible → degradado
    }
  }

  return (
    <AdminLayout>
      <AdminPanel titleKey="dashboardTitle" descriptionKey="dashboardTagline">
        {data === null ? (
          <DegradedState message={t("degraded")} retryLabel={t("retry")} />
        ) : (
          <DashboardMetrics data={data} />
        )}
      </AdminPanel>
    </AdminLayout>
  );
}
