import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MaintenanceRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { MAINTENANCE_SUITE_ROLES } from "@/lib/mantenimiento/roles";

export const dynamic = "force-dynamic";

const repo = new MaintenanceRepository();

/**
 * GET /api/mantenimiento/informes — informe operativo de la suite (F4 · T4.4).
 *
 * Agrega por **periodo**: incidencias por estado/tipo/técnico, tareas preventivas por estado, y
 * ejecuciones de áreas comunes verificadas/pendientes. Los filtros opcionales (`from`, `to`,
 * `roomId`, `technician`) acotan la lectura; no se inventan totales: se derivan de los registros.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, [...MAINTENANCE_SUITE_ROLES]);
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const roomId = params.get("roomId") ?? undefined;
  const technician = params.get("technician") ?? undefined;

  const inRange = (value: Date | string | null): boolean => {
    if (!from && !to) return true;
    const time = value === null ? NaN : new Date(value).getTime();
    if (!Number.isFinite(time)) return false;
    if (from && time < new Date(`${from}T00:00:00Z`).getTime()) return false;
    if (to && time > new Date(`${to}T23:59:59Z`).getTime()) return false;
    return true;
  };

  try {
    const [incidents, tasks, areaLogs] = await Promise.all([
      repo.listIncidents(roomId ? { roomId } : {}),
      repo.listTasks(),
      repo.listAreaLogs({ from, to }),
    ]);

    const filteredIncidents = incidents.filter((incident) => inRange(incident.createdAt));
    const filteredTasks = tasks.filter((task) => inRange(task.completedAt ?? task.dueDate));
    const filteredLogs = areaLogs.filter(
      (log) => !technician || log.performedBy.toLowerCase() === technician.toLowerCase(),
    );

    const countBy = <T, K extends string>(items: readonly T[], key: (item: T) => K): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const item of items) {
        const k = key(item);
        out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };

    const technicians = new Set<string>();
    for (const incident of filteredIncidents) {
      if (incident.assignedTo) technicians.add(incident.assignedTo);
      technicians.add(incident.reportedBy);
    }
    for (const log of filteredLogs) technicians.add(log.performedBy);

    return NextResponse.json({
      range: { from: from ?? null, to: to ?? null },
      incidents: {
        total: filteredIncidents.length,
        byStatus: countBy(filteredIncidents, (incident) => incident.status),
        byKind: countBy(filteredIncidents, (incident) => incident.kind),
        byPriority: countBy(filteredIncidents, (incident) => incident.priority),
        byTechnician: countBy(filteredIncidents, (incident) => incident.assignedTo ?? "SIN_ASIGNAR"),
        blockingOpen: filteredIncidents.filter(
          (incident) => incident.blocksSale && (incident.status === "OPEN" || incident.status === "IN_PROGRESS"),
        ).length,
      },
      preventive: {
        total: filteredTasks.length,
        byStatus: countBy(filteredTasks, (task) => task.status),
        criticalPending: filteredTasks.filter((task) => task.isCritical && task.status === "PENDING").length,
        signed: filteredTasks.filter((task) => task.signatureId !== null).length,
      },
      areas: {
        logged: filteredLogs.length,
        pendingVerification: filteredLogs.filter((log) => log.verifiedAt === null).length,
        byArea: countBy(filteredLogs, (log) => log.areaName ?? "SIN_AREA"),
      },
      technicians: [...technicians].sort(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[API /api/mantenimiento/informes] GET:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "No se pudo generar el informe." },
      { status: 500 },
    );
  }
}
