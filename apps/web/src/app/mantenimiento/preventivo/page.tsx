import { getTranslations } from "next-intl/server";
import { MaintenanceRepository } from "@hotel/shared";
import { PreventiveBoard } from "@/components/maintenance/PreventiveBoard";
import type { PreventiveTaskDto } from "@/lib/mantenimiento/types";

export const dynamic = "force-dynamic";

/** Preventivo de la suite (F4 · T4.1): tareas pendientes y su exigencia de firma por criticidad. */
export default async function MaintenancePreventivePage() {
  const t = await getTranslations("maintenance");
  const repo = new MaintenanceRepository();
  const tasks = await repo.listTasks({ status: "PENDING" }).catch(() => []);

  const rows: PreventiveTaskDto[] = tasks.map((task) => ({
    id: task.id,
    planId: task.planId,
    dueDate: task.dueDate,
    status: task.status,
    completedBy: task.completedBy,
    completedAt: task.completedAt?.toISOString() ?? null,
    notes: task.notes,
    planCode: task.planCode,
    planName: task.planName,
    equipment: task.equipment,
    periodicity: task.periodicity,
    roomNumber: task.roomNumber,
    overdue: task.overdue,
    areaId: task.areaId,
    areaName: task.areaName,
    isCritical: task.isCritical,
    requiresSignature: task.requiresSignature,
    signatureId: task.signatureId,
    evidencePath: task.evidencePath,
  }));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold tracking-tight text-ink">{t("preventiveTitle")}</h1>
        <p className="text-body text-ink-soft">{t("preventiveTagline")}</p>
        <p className="text-small text-ink-soft">{t("preventiveSignatureNote")}</p>
      </header>
      <PreventiveBoard tasks={rows} />
    </>
  );
}
