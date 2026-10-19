import { getTranslations } from "next-intl/server";
import { currentMaintenanceSession } from "@/lib/mantenimiento/session";
import { MaintenanceRepository, type MaintenanceStatus } from "@hotel/shared";
import { IncidentList } from "@/components/maintenance/IncidentList";
import type { IncidentDto } from "@/lib/mantenimiento/types";

export const dynamic = "force-dynamic";

const STATUSES: readonly MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"];

/** Incidencias de la suite (F4 · T4.1), con filtro por estado en la URL. */
export default async function MaintenanceIncidentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  // Defensa en profundidad (M7 · H1): el payload RSC de la página no debe generarse sin sesión.
  const session = await currentMaintenanceSession();
  if (!session.ok) return null;
  const t = await getTranslations("maintenance");
  const params = (await searchParams) ?? {};
  const status = STATUSES.includes(params.status as MaintenanceStatus)
    ? (params.status as MaintenanceStatus)
    : undefined;
  const repo = new MaintenanceRepository();
  const incidents = await repo.listIncidents(status ? { status } : {}).catch(() => []);

  const rows: IncidentDto[] = incidents.map((incident) => ({
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

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("incidentsTitle")}</h1>
        <p className="text-body text-ink-soft">{t("incidentsTagline")}</p>
      </header>
      <IncidentList incidents={rows} canManage />
    </>
  );
}
