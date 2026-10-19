import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MaintenanceRepository } from "@hotel/shared";
import { defaultBoardDate } from "@/lib/housekeeping-board";
import { IncidentList } from "@/components/maintenance/IncidentList";
import type { IncidentDto } from "@/lib/mantenimiento/types";

export const dynamic = "force-dynamic";

const CARD = "rounded-brand border border-line px-4 py-3";

/**
 * **Dashboard de la Suite de Mantenimiento** (F4 · T4.1): resumen operativo del jefe con las
 * incidencias abiertas, el preventivo vencido, las habitaciones bloqueadas y las áreas críticas.
 *
 * Lee los repositorios en servidor (la sesión ya la valida el layout) y pasa DTO planos al cliente.
 */
export default async function MaintenanceDashboardPage() {
  const t = await getTranslations("maintenance");
  const repo = new MaintenanceRepository();
  const date = defaultBoardDate();
  const [board, criticalAreas, plans, pendingLogs] = await Promise.all([
    repo
      .getBoard(date)
      .catch(() => ({ date, incidents: [], dueTasks: [], blockedRoomIds: [], generatedAt: "" })),
    repo.listCriticalAreas().catch(() => []),
    repo.listPlans().catch(() => []),
    repo.listAreaLogs({ pendingVerification: true }).catch(() => []),
  ]);

  const incidents: IncidentDto[] = board.incidents.map((incident) => ({
    id: incident.id,
    roomId: incident.roomId,
    roomNumber: incident.roomNumber,
    kind: incident.kind,
    description: incident.description,
    priority: incident.priority,
    status: incident.status,
    blocksSale: incident.blocksSale,
    reportedBy: incident.reportedBy,
    assignedTo: incident.assignedTo,
    createdAt: incident.createdAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    resolvedBy: incident.resolvedBy,
  }));

  const stats = [
    { key: "incidentsOpen", value: board.incidents.length, href: "/mantenimiento/incidencias" },
    { key: "preventiveDue", value: board.dueTasks.length, href: "/mantenimiento/preventivo" },
    { key: "blockedRooms", value: board.blockedRoomIds.length, href: "/mantenimiento/incidencias" },
    { key: "pendingLogs", value: pendingLogs.length, href: "/mantenimiento/areas-comunes" },
  ] as const;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("dashboardTagline")}</p>
      </header>

      <section className="grid gap-3 tablet:grid-cols-4" data-testid="maintenance-dashboard">
        {stats.map((stat) => (
          <Link key={stat.key} href={stat.href} className={`${CARD} transition-colors hover:bg-mist-2`}>
            <p className="text-micro uppercase tracking-wider text-ink-soft">{t(`dashboard.${stat.key}`)}</p>
            <p className="text-h2 font-semibold text-ink">{stat.value}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-3 tablet:grid-cols-2">
        <div className={CARD}>
          <h2 className="text-h4 font-semibold text-ink">{t("criticalAreasTitle")}</h2>
          {criticalAreas.length === 0 ? (
            <p className="mt-1 text-small text-ink-soft">{t("criticalAreasEmpty")}</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-small text-ink-soft">
              {criticalAreas.map((area) => (
                <li key={area.id}>
                  {area.name} · {area.areaTypeName ?? area.areaTypeCode}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={CARD}>
          <h2 className="text-h4 font-semibold text-ink">{t("plansTitle")}</h2>
          {plans.length === 0 ? (
            <p className="mt-1 text-small text-ink-soft">{t("noPlans")}</p>
          ) : (
            <p className="mt-1 text-small text-ink-soft">{t("plansCount", { count: plans.length })}</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h4 font-semibold text-ink">{t("incidentsTitle")}</h2>
          <Link href="/mantenimiento/incidencias" className="text-small font-semibold text-azure underline">
            {t("seeAll")}
          </Link>
        </div>
        <IncidentList incidents={incidents} canManage={false} />
      </section>
    </>
  );
}
