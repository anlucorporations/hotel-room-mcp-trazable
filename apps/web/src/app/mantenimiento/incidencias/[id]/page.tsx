import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MaintenanceRepository, RoomsRepository } from "@hotel/shared";
import { IncidentDetail } from "@/components/maintenance/IncidentDetail";
import type { IncidentEventDto } from "@/lib/mantenimiento/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ficha de incidencia (F4 · T4.1/T4.2): detalle, historial y bloqueo/desbloqueo firmado. */
export default async function MaintenanceIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("maintenance");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const repo = new MaintenanceRepository();
  const roomsRepo = new RoomsRepository();
  const found = await repo.findIncident(id);
  if (found === null) notFound();
  const { incident } = found;

  const [events, room] = await Promise.all([
    repo.listIncidentEvents(id).catch(() => []),
    roomsRepo.findById(incident.roomId).catch(() => null),
  ]);

  const eventRows: IncidentEventDto[] = events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    notes: event.notes,
    actor: event.actor,
    createdAt: event.createdAt.toISOString(),
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("incidentDetailTitle")}</h1>
        <p className="text-body text-ink-soft">{t("incidentDetailTagline")}</p>
      </header>
      <IncidentDetail
        incident={{
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
        }}
        events={eventRows}
        publicationStatus={room?.publicationStatus ?? null}
        canManage
      />
    </>
  );
}
