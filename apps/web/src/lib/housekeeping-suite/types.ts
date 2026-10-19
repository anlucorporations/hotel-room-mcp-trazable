/**
 * DTO de la **Suite Ama de llaves** (F6).
 *
 * Tipos planos para componentes de cliente: el barril raíz de `@hotel/shared` arrastra `pg` al
 * bundle, así que las páginas RSC leen los repositorios y serializan a estos tipos.
 */

export interface ShiftDto {
  readonly id: string;
  readonly shiftDate: string;
  readonly label: string;
  readonly supervisor: string;
}

export interface AssignmentDto {
  readonly id: string;
  readonly shiftId: string;
  readonly roomId: string;
  readonly roomNumber: number | null;
  readonly assignee: string;
  readonly status: string;
  readonly assignedAt: string;
  readonly completedAt: string | null;
}

export interface RoomCandidateDto {
  readonly roomId: string;
  readonly roomNumber: number;
  readonly roomType: string;
  readonly operationalStatus: string;
  readonly reason: string;
}

export interface InspectionDto {
  readonly id: string;
  readonly roomId: string;
  readonly assignmentId: string | null;
  readonly inspectedBy: string;
  readonly inspectionType: string;
  readonly result: string;
  readonly observations: string | null;
  readonly signatureId: string | null;
  readonly createdAt: string;
}

export interface SupplyItemDto {
  readonly code: string;
  readonly nameEs: string;
  readonly unit: string;
  readonly stockQty: number;
  readonly thresholdQty: number;
}
