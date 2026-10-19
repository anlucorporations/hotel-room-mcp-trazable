import { getTranslations } from "next-intl/server";
import { currentMaintenanceSession } from "@/lib/mantenimiento/session";
import { MaintenanceRepository } from "@hotel/shared";
import { CommonAreasBoard } from "@/components/maintenance/CommonAreasBoard";
import type { AreaDto, AreaLogDto } from "@/lib/mantenimiento/types";

export const dynamic = "force-dynamic";

/** Áreas comunes de la suite (F4 · T4.1/T4.4): tareas rutinarias y verificación de ejecuciones. */
export default async function MaintenanceCommonAreasPage() {
  // Defensa en profundidad (M7 · H1): el payload RSC de la página no debe generarse sin sesión.
  const session = await currentMaintenanceSession();
  if (!session.ok) return null;
  const t = await getTranslations("maintenance");
  const repo = new MaintenanceRepository();
  const [areas, pendingLogs] = await Promise.all([
    repo.listAreas().catch(() => []),
    repo.listAreaLogs({ pendingVerification: true }).catch(() => []),
  ]);

  const areaRows: AreaDto[] = await Promise.all(
    areas.map(async (area) => ({
      id: area.id,
      areaTypeCode: area.areaTypeCode,
      areaTypeName: area.areaTypeName,
      isCritical: area.isCritical,
      name: area.name,
      locationNotes: area.locationNotes,
      isActive: area.isActive,
      tasks: (await repo.listAreaTasks(area.id).catch(() => [])).map((task) => ({
        id: task.id,
        areaId: task.areaId,
        label: task.label,
        periodicity: task.periodicity,
        estimatedMinutes: task.estimatedMinutes,
        isActive: task.isActive,
      })),
    })),
  );

  const logRows: AreaLogDto[] = pendingLogs.map((log) => ({
    id: log.id,
    taskId: log.taskId,
    performedBy: log.performedBy,
    performedAt: log.performedAt.toISOString(),
    notes: log.notes,
    evidencePath: log.evidencePath,
    verifiedBy: log.verifiedBy,
    verifiedAt: log.verifiedAt?.toISOString() ?? null,
    signatureId: log.signatureId,
    areaId: log.areaId,
    areaName: log.areaName,
    taskLabel: log.taskLabel,
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("areasTitle")}</h1>
        <p className="text-body text-ink-soft">{t("areasTagline")}</p>
      </header>
      <CommonAreasBoard areas={areaRows} pendingLogs={logRows} />
    </>
  );
}
