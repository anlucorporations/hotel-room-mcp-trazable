/**
 * DTO de la **Suite de Mantenimiento vNext** (F4).
 *
 * Viven aquí —y no en el repositorio de `@hotel/shared`— porque los componentes de cliente no pueden
 * importar el barril raíz del paquete (arrastra `pg`/`ioredis` al bundle). Las páginas RSC leen los
 * repositorios del servidor y serializan a estos tipos planos antes de pasarlos al cliente.
 */

export interface IncidentDto {
  readonly id: string;
  readonly roomId: string;
  readonly roomNumber: number | null;
  readonly kind: string;
  readonly description: string | null;
  readonly priority: string;
  readonly status: string;
  readonly blocksSale: boolean;
  readonly reportedBy: string;
  readonly assignedTo: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
}

export interface IncidentEventDto {
  readonly id: string;
  readonly eventType: string;
  readonly notes: string | null;
  readonly actor: string;
  readonly createdAt: string;
}

export interface PreventiveTaskDto {
  readonly id: string;
  readonly planId: string;
  readonly dueDate: string;
  readonly status: string;
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  readonly notes: string | null;
  readonly planCode: string | null;
  readonly planName: string | null;
  readonly equipment: string | null;
  readonly periodicity: string | null;
  readonly roomNumber: number | null;
  readonly overdue: boolean;
  readonly areaId: string | null;
  readonly areaName: string | null;
  readonly isCritical: boolean;
  readonly requiresSignature: boolean;
  readonly signatureId: string | null;
  readonly evidencePath: string | null;
}

export interface AreaTaskDto {
  readonly id: string;
  readonly areaId: string;
  readonly label: string;
  readonly periodicity: string;
  readonly estimatedMinutes: number | null;
  readonly isActive: boolean;
}

export interface AreaDto {
  readonly id: string;
  readonly areaTypeCode: string;
  readonly areaTypeName: string | null;
  readonly isCritical: boolean;
  readonly name: string;
  readonly locationNotes: string | null;
  readonly isActive: boolean;
  readonly tasks: readonly AreaTaskDto[];
}

export interface AreaLogDto {
  readonly id: string;
  readonly taskId: string;
  readonly performedBy: string;
  readonly performedAt: string;
  readonly notes: string | null;
  readonly evidencePath: string | null;
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
  readonly signatureId: string | null;
  readonly areaId: string | null;
  readonly areaName: string | null;
  readonly taskLabel: string | null;
}

/** Reporte agregado de `/api/mantenimiento/informes`. */
export interface MaintenanceReportDto {
  readonly range: { readonly from: string | null; readonly to: string | null };
  readonly incidents: {
    readonly total: number;
    readonly byStatus: Record<string, number>;
    readonly byKind: Record<string, number>;
    readonly byPriority: Record<string, number>;
    readonly byTechnician: Record<string, number>;
    readonly blockingOpen: number;
  };
  readonly preventive: {
    readonly total: number;
    readonly byStatus: Record<string, number>;
    readonly criticalPending: number;
    readonly signed: number;
  };
  readonly areas: {
    readonly logged: number;
    readonly pendingVerification: number;
    readonly byArea: Record<string, number>;
  };
  readonly technicians: readonly string[];
  readonly generatedAt: string;
}
