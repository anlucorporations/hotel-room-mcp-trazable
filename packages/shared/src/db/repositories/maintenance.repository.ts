import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import {
  MAINTENANCE_PUBLICATION_STATUS,
  PREVENTIVE_PERIOD_DAYS,
  publicationStatusAfterUnblock,
  type MaintenancePriority,
  type MaintenanceStatus,
  type PreventivePeriodicity,
} from "../../domain/maintenance";
import type { RoomPublicationStatus } from "../../domain/operations-state";

/**
 * Repositorio de Mantenimiento y Servicios Técnicos (Suite Administración → Mantenimiento y ruta
 * `/mantenimiento`, D-19, D-52…D-54, D-63).
 *
 * Cubre:
 *
 *   1. **Incidencias** (`maintenance_incidents`): las reportan recepción y limpieza, el técnico las
 *      atiende y las resuelve (D-52). Cada cambio deja un evento con su actor (`maintenance_incident_events`).
 *   2. **Bloqueo de venta** (D-53): una incidencia `OPEN`/`IN_PROGRESS` con `blocks_sale = TRUE`
 *      convierte la habitación en **no vendible** (`listBlockedRoomIds`); al resolverla o cancelarla,
 *      el bloqueo desaparece **solo**, sin tocar el estado de publicación de la habitación.
 *   3. **Preventivo con cronograma** (D-54): planes con periodicidad (semanal/mensual/trimestral),
 *      generación de la siguiente tarea al cerrar la actual, listado de **tareas vencidas** («aviso»)
 *      y registro del cumplimiento (quién y cuándo).
 *
 * **Sin PII de viajeros** (ADR-20/RNF-30): solo habitaciones, equipos y personal del hotel.
 */

export type MaintenanceEventType = "REPORTED" | "ASSIGNED" | "RESOLVED" | "CANCELLED";
export type PreventiveTaskStatus = "PENDING" | "DONE" | "SKIPPED";

export interface MaintenanceIncidentRecord {
  id: string;
  roomId: string;
  roomNumber: number | null;
  kind: string;
  description: string | null;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  /** `true` mientras está abierta retira la habitación de la venta (D-53). */
  blocksSale: boolean;
  reportedBy: string;
  /** Rol del reportero (`HEAD_KEEPER`/`HOUSEKEEPER`/`RECEPTION_ROLE`) cuando consta (F6 · T6.7). */
  reportedByRole: string | null;
  assignedTo: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  /** Área común afectada, si la incidencia se reportó contra una (F1 · T1.9). */
  areaId?: string | null;
}

export interface MaintenanceIncidentEventRecord {
  id: string;
  incidentId: string;
  eventType: MaintenanceEventType;
  notes: string | null;
  actor: string;
  createdAt: Date;
}

/** Resultado de un bloqueo/desbloqueo firmado de habitación (F4 · T4.6). */
export interface MaintenanceRoomBlockRecord {
  readonly roomId: string;
  readonly roomNumber: number;
  /** Estado de publicación antes de la operación (en el desbloqueo, `MAINTENANCE`). */
  readonly previousPublicationStatus: RoomPublicationStatus;
  /** Estado de publicación resultante (`MAINTENANCE` al bloquear; el restaurado al desbloquear). */
  readonly publicationStatus: RoomPublicationStatus;
  readonly blockedUntil: string | null;
  readonly reason: string | null;
  readonly incidentId: string | null;
  readonly signatureId: string;
}

export interface PreventivePlanRecord {
  id: string;
  code: string;
  name: string;
  equipment: string;
  roomId: string | null;
  roomNumber: number | null;
  periodicity: PreventivePeriodicity;
  active: boolean;
  createdAt: Date;
  /** Área común asociada al plan preventivo, si la hay (F1 · T1.9). */
  areaId?: string | null;
}

export interface PreventiveTaskRecord {
  id: string;
  planId: string;
  dueDate: string;
  status: PreventiveTaskStatus;
  completedBy: string | null;
  completedAt: Date | null;
  notes: string | null;
  /** Datos del plan, unidos para pintar el listado sin una consulta extra. */
  planCode: string | null;
  planName: string | null;
  equipment: string | null;
  periodicity: PreventivePeriodicity | null;
  roomNumber: number | null;
  /** `true` si la tarea sigue pendiente y su fecha ya pasó (aviso, D-54). */
  overdue: boolean;
  /** Área común del plan (F4 · T4.4/T4.5), si la hay. */
  areaId: string | null;
  areaName: string | null;
  /** `true` si el área es crítica: la verificación exige firma EIP-712 (D-C23). */
  isCritical: boolean;
  /** `true` si la tarea exige firma (marca explícita o área crítica). */
  requiresSignature: boolean;
  /** Firma EIP-712 enlazada al cierre, si la hubo (F4 · T4.5). */
  signatureId: string | null;
  /** Evidencia adjunta al cierre (foto/nota), si la hay. */
  evidencePath: string | null;
  /** Operario de terminal al que está asignada la tarea (F5 · solo lo asignado). */
  assignedTo: string | null;
  /** Estado de validación del jefe (F8): `PENDING_VERIFICATION` al cerrar desde terminal. */
  validationStatus: "PENDING_VERIFICATION" | "VALIDATED" | "PENDING_VERIFICATION_EXPIRED" | null;
  /** Marca de actualización para el bloqueo optimista del terminal (F5 · T5.5). */
  updatedAt: Date | null;
}

/** Periodicidad de una tarea rutinaria de área común (F1 · T1.9). */
export type CloseTaskOptions = {
  /** Firma EIP-712 del jefe cuando la tarea exige firma (área crítica, F4 · T4.5). */
  signatureId?: string | null;
  /** Evidencia adjunta al cierre (foto/nota); su ausencia solo avisa (D-C12). */
  evidencePath?: string | null;
  /**
   * F5 · CU-V-14: un técnico/limpieza cierra desde el terminal y el jefe debe validar en 24 h.
   * El cierre desde la suite del jefe (F4) no marca validación pendiente.
   */
  validationStatus?: "PENDING_VERIFICATION" | "VALIDATED" | null;
  /** Bloqueo optimista del terminal: instante leído por el cliente (T5.5). */
  expectedUpdatedAt?: Date | null;
};

export const AREA_PERIODICITIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type AreaPeriodicity = (typeof AREA_PERIODICITIES)[number];

export interface MaintenanceAreaTypeRecord {
  code: string;
  nameEs: string;
  nameEn: string;
  nameRu: string;
  /** `true` para áreas críticas (piscina, ascensor, generador…): control reforzado. */
  isCritical: boolean;
  sortOrder: number;
}

export interface MaintenanceAreaRecord {
  id: string;
  /** Código del tipo (`maintenance_area_types.code`). */
  areaTypeCode: string;
  /** Nombre visible del tipo, unido para pintar sin consulta extra. */
  areaTypeName: string | null;
  isCritical: boolean;
  name: string;
  locationNotes: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface MaintenanceAreaTaskRecord {
  id: string;
  areaId: string;
  label: string;
  periodicity: AreaPeriodicity;
  estimatedMinutes: number | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface MaintenanceAreaLogRecord {
  id: string;
  taskId: string;
  performedBy: string;
  performedAt: Date;
  notes: string | null;
  evidencePath: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  signatureId: string | null;
  /** Datos de la tarea y el área, unidos para el listado (nulos al registrar/verificar). */
  areaId: string | null;
  taskLabel: string | null;
  areaName: string | null;
}

export interface MaintenanceBoard {
  date: string;
  incidents: MaintenanceIncidentRecord[];
  dueTasks: PreventiveTaskRecord[];
  blockedRoomIds: string[];
  generatedAt: string;
}

export type MaintenanceErrorCode =
  | "ROOM_NOT_FOUND"
  | "INCIDENT_NOT_FOUND"
  | "INCIDENT_CLOSED"
  | "PLAN_EXISTS"
  | "PLAN_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "TASK_CLOSED"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "AREA_TYPE_NOT_FOUND"
  | "AREA_NOT_FOUND"
  | "AREA_TASK_NOT_FOUND"
  | "AREA_TASK_INVALID_PERIODICITY"
  | "AREA_LOG_NOT_FOUND"
  | "SIGNATURE_REQUIRED"
  | "ROOM_ALREADY_BLOCKED"
  | "ROOM_NOT_BLOCKED";

export class MaintenanceError extends Error {
  constructor(
    readonly code: MaintenanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaintenanceError";
  }
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/** Suma la periodicidad a una fecha ISO `YYYY-MM-DD` y devuelve otra fecha ISO. */
export function nextDueDate(fromIso: string, periodicity: PreventivePeriodicity): string {
  const base = new Date(`${fromIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + PREVENTIVE_PERIOD_DAYS[periodicity]);
  return base.toISOString().slice(0, 10);
}

export class MaintenanceRepository {
  constructor(private pool: Pool = getDbPool()) {}

  // ---------------------------------------------------------------------------
  // Incidencias (D-52, D-53)
  // ---------------------------------------------------------------------------

  /** Reporta una avería (recepción o limpieza) y deja el evento `REPORTED`. */
  async reportIncident(input: {
    roomId: string;
    kind: string;
    description?: string | null;
    priority?: MaintenancePriority;
    blocksSale?: boolean;
    reportedBy: string;
    /** Rol del reportero en la plataforma (`HEAD_KEEPER`, `HOUSEKEEPER`, `RECEPTION_ROLE`…, T6.7). */
    reportedByRole?: string | null;
    areaId?: string | null;
  }): Promise<MaintenanceIncidentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const room = await client.query(`SELECT id FROM rooms WHERE id = $1 AND archived_at IS NULL`, [
        input.roomId,
      ]);
      if (room.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new MaintenanceError("ROOM_NOT_FOUND", "La habitación no existe o está archivada.");
      }
      const inserted = await client.query(
        `INSERT INTO maintenance_incidents
           (room_id, kind, description, priority, status, blocks_sale, reported_by, area_id,
            reported_by_role)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8)
         RETURNING *`,
        [
          input.roomId,
          input.kind,
          input.description?.trim() || null,
          input.priority ?? "MEDIUM",
          input.blocksSale ?? true,
          input.reportedBy,
          input.areaId ?? null,
          input.reportedByRole ?? null,
        ],
      );
      await client.query(
        `INSERT INTO maintenance_incident_events (incident_id, event_type, notes, actor)
         VALUES ($1, 'REPORTED', $2, $3)`,
        [inserted.rows[0].id, input.description?.trim() || null, input.reportedBy],
      );
      const withRoom = await this.findIncidentWith(client, inserted.rows[0].id);
      await client.query("COMMIT");
      return withRoom as MaintenanceIncidentRecord;
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Asigna la incidencia a un técnico y la pasa a `IN_PROGRESS`. */
  async assignIncident(
    id: string,
    assignedTo: string,
    actor: string,
    notes?: string | null,
  ): Promise<MaintenanceIncidentRecord | null> {
    return this.transitionIncident(id, "IN_PROGRESS", "ASSIGNED", actor, notes ?? null, {
      assigned_to: assignedTo,
    });
  }

  /** Marca la incidencia como **resuelta**: el bloqueo de venta desaparece solo (D-53). */
  async resolveIncident(id: string, actor: string, notes?: string | null): Promise<MaintenanceIncidentRecord | null> {
    return this.transitionIncident(id, "RESOLVED", "RESOLVED", actor, notes ?? null, {
      resolved_at: new Date(),
      resolved_by: actor,
    });
  }

  /** Cancela una incidencia (p. ej. reportada por error); también libera el bloqueo. */
  async cancelIncident(id: string, actor: string, notes?: string | null): Promise<MaintenanceIncidentRecord | null> {
    return this.transitionIncident(id, "CANCELLED", "CANCELLED", actor, notes ?? null, {});
  }

  // ── Bloqueo/desbloqueo firmado de habitación (F4 · T4.6, D-C23/D-C34, D-V7) ──────────────

  /**
   * **Bloquea una habitación para la venta con firma EIP-712 obligatoria** (D-C23).
   *
   * Efectos en una sola transacción:
   *   1. `rooms.publication_status = 'MAINTENANCE'` (D-V7: el catálogo deja de ofrecerla).
   *   2. Guarda `maintenance_blocked_until`/`maintenance_blocked_reason`.
   *   3. Deja traza en `room_status_history` (D-19) con el estado previo.
   *   4. Enlaza la firma en `maintenance_incidents.block_signature_id` si se pasa una incidencia.
   *
   * La firma se **exige como parámetro**: la API la valida antes (F2/F3) y este repositorio rechaza
   * cualquier llamada sin `signatureId` — así ninguna ruta puede saltarse la firma por descuido.
   */
  async blockRoomWithSignature(input: {
    readonly roomId: string;
    readonly signatureId: string;
    readonly actor: string;
    readonly incidentId?: string | null;
    readonly reason?: string | null;
    readonly until?: string | null;
  }): Promise<MaintenanceRoomBlockRecord> {
    if (typeof input.signatureId !== "string" || input.signatureId.trim() === "") {
      throw new MaintenanceError("SIGNATURE_REQUIRED", "Bloquear una habitación exige una firma EIP-712.");
    }
    const reason = input.reason?.trim() ? input.reason.trim().slice(0, 200) : null;
    const until = input.until?.trim() ? input.until.trim() : null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const room = await client.query<QueryResultRow>(
        `SELECT id, room_number, publication_status, archived_at FROM rooms WHERE id = $1 FOR UPDATE`,
        [input.roomId],
      );
      const roomRow = room.rows[0];
      if (!roomRow || roomRow.archived_at !== null) {
        throw new MaintenanceError("ROOM_NOT_FOUND", "La habitación no existe o está archivada.");
      }
      const previous = roomRow.publication_status as RoomPublicationStatus;
      if (previous === MAINTENANCE_PUBLICATION_STATUS) {
        throw new MaintenanceError("ROOM_ALREADY_BLOCKED", "La habitación ya está bloqueada por mantenimiento.");
      }
      await this.assertIncidentCanBeSigned(client, input.incidentId, input.roomId);
      await client.query(
        `UPDATE rooms
            SET publication_status = $2,
                maintenance_blocked_until = $3::date,
                maintenance_blocked_reason = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [input.roomId, MAINTENANCE_PUBLICATION_STATUS, until, reason],
      );
      await client.query(
        `INSERT INTO room_status_history
           (room_id, status_kind, from_value, to_value, changed_by, reason)
         VALUES ($1, 'PUBLICATION', $2, $3, $4, $5)`,
        [input.roomId, previous, MAINTENANCE_PUBLICATION_STATUS, input.actor, reason],
      );
      if (input.incidentId) {
        await client.query(
          `UPDATE maintenance_incidents SET block_signature_id = $2 WHERE id = $1`,
          [input.incidentId, input.signatureId],
        );
      }
      await client.query("COMMIT");
      return {
        roomId: input.roomId,
        roomNumber: Number(roomRow.room_number),
        previousPublicationStatus: previous,
        publicationStatus: MAINTENANCE_PUBLICATION_STATUS,
        blockedUntil: until,
        reason,
        incidentId: input.incidentId ?? null,
        signatureId: input.signatureId,
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * **Desbloquea una habitación con firma EIP-712 obligatoria** y restaura el estado de publicación
   * que tenía **antes** del bloqueo (de `room_status_history`; si no hay historial, `DRAFT`).
   */
  async unblockRoomWithSignature(input: {
    readonly roomId: string;
    readonly signatureId: string;
    readonly actor: string;
    readonly incidentId?: string | null;
    readonly reason?: string | null;
  }): Promise<MaintenanceRoomBlockRecord> {
    if (typeof input.signatureId !== "string" || input.signatureId.trim() === "") {
      throw new MaintenanceError("SIGNATURE_REQUIRED", "Desbloquear una habitación exige una firma EIP-712.");
    }
    const reason = input.reason?.trim() ? input.reason.trim().slice(0, 200) : null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const room = await client.query<QueryResultRow>(
        `SELECT id, room_number, publication_status, archived_at FROM rooms WHERE id = $1 FOR UPDATE`,
        [input.roomId],
      );
      const roomRow = room.rows[0];
      if (!roomRow || roomRow.archived_at !== null) {
        throw new MaintenanceError("ROOM_NOT_FOUND", "La habitación no existe o está archivada.");
      }
      if (roomRow.publication_status !== MAINTENANCE_PUBLICATION_STATUS) {
        throw new MaintenanceError("ROOM_NOT_BLOCKED", "La habitación no está bloqueada por mantenimiento.");
      }
      const history = await client.query<QueryResultRow>(
        `SELECT from_value FROM room_status_history
          WHERE room_id = $1 AND status_kind = 'PUBLICATION' AND to_value = $2
          ORDER BY changed_at DESC LIMIT 1`,
        [input.roomId, MAINTENANCE_PUBLICATION_STATUS],
      );
      const restored = publicationStatusAfterUnblock(
        (history.rows[0]?.from_value as string | null | undefined) ?? null,
      );
      await this.assertIncidentCanBeSigned(client, input.incidentId, input.roomId);
      await client.query(
        `UPDATE rooms
            SET publication_status = $2,
                maintenance_blocked_until = NULL,
                maintenance_blocked_reason = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [input.roomId, restored],
      );
      await client.query(
        `INSERT INTO room_status_history
           (room_id, status_kind, from_value, to_value, changed_by, reason)
         VALUES ($1, 'PUBLICATION', $2, $3, $4, $5)`,
        [input.roomId, MAINTENANCE_PUBLICATION_STATUS, restored, input.actor, reason],
      );
      if (input.incidentId) {
        await client.query(
          `UPDATE maintenance_incidents SET unblock_signature_id = $2 WHERE id = $1`,
          [input.incidentId, input.signatureId],
        );
      }
      await client.query("COMMIT");
      return {
        roomId: input.roomId,
        roomNumber: Number(roomRow.room_number),
        previousPublicationStatus: MAINTENANCE_PUBLICATION_STATUS,
        publicationStatus: restored,
        blockedUntil: null,
        reason,
        incidentId: input.incidentId ?? null,
        signatureId: input.signatureId,
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Valida que la incidencia existe, pertenece a la habitación y sigue abierta (si se aporta). */
  private async assertIncidentCanBeSigned(
    client: PoolClient,
    incidentId: string | null | undefined,
    roomId: string,
  ): Promise<void> {
    if (!incidentId) return;
    const incident = await client.query<QueryResultRow>(
      `SELECT id, room_id, status FROM maintenance_incidents WHERE id = $1 FOR UPDATE`,
      [incidentId],
    );
    const incidentRow = incident.rows[0];
    if (!incidentRow || incidentRow.room_id !== roomId) {
      throw new MaintenanceError("INCIDENT_NOT_FOUND", "La incidencia no existe o no pertenece a esa habitación.");
    }
    if (["RESOLVED", "CANCELLED"].includes(String(incidentRow.status))) {
      throw new MaintenanceError("INCIDENT_CLOSED", "La incidencia ya está cerrada.");
    }
  }

  async listIncidents(
    filter: { status?: MaintenanceStatus; roomId?: string; assignedTo?: string; openOnly?: boolean } = {},
  ): Promise<MaintenanceIncidentRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.status) {
      values.push(filter.status);
      where.push(`i.status = $${values.length}`);
    }
    if (filter.openOnly) where.push(`i.status IN ('OPEN', 'IN_PROGRESS')`);
    if (filter.roomId) {
      values.push(filter.roomId);
      where.push(`i.room_id = $${values.length}`);
    }
    if (filter.assignedTo) {
      values.push(filter.assignedTo);
      where.push(`i.assigned_to = $${values.length}`);
    }
    const res = await this.pool.query(
      `SELECT i.*, r.room_number
         FROM maintenance_incidents i
         LEFT JOIN rooms r ON r.id = i.room_id
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY CASE i.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, i.created_at ASC`,
      values,
    );
    return res.rows.map(mapIncident);
  }

  async findIncident(
    id: string,
  ): Promise<{ incident: MaintenanceIncidentRecord; events: MaintenanceIncidentEventRecord[] } | null> {
    const res = await this.pool.query(
      `SELECT i.*, r.room_number
         FROM maintenance_incidents i
         LEFT JOIN rooms r ON r.id = i.room_id
        WHERE i.id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    const events = await this.listIncidentEvents(id);
    return { incident: mapIncident(res.rows[0]), events };
  }

  async listIncidentEvents(incidentId: string): Promise<MaintenanceIncidentEventRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM maintenance_incident_events WHERE incident_id = $1 ORDER BY created_at ASC`,
      [incidentId],
    );
    return res.rows.map(mapIncidentEvent);
  }

  /** Habitaciones **no vendibles** por avería: incidencias abiertas que bloquean la venta (D-53). */
  async listBlockedRoomIds(): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT room_id FROM maintenance_incidents
        WHERE blocks_sale = TRUE AND status IN ('OPEN', 'IN_PROGRESS')`,
    );
    return res.rows.map((row) => row.room_id as string);
  }

  async isRoomBlocked(roomId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM maintenance_incidents
        WHERE room_id = $1 AND blocks_sale = TRUE AND status IN ('OPEN', 'IN_PROGRESS')
        LIMIT 1`,
      [roomId],
    );
    return res.rows.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Preventivo (D-54)
  // ---------------------------------------------------------------------------

  /** Alta de un plan preventivo y de su primera tarea. */
  async createPlan(input: {
    code: string;
    name: string;
    equipment: string;
    roomId?: string | null;
    periodicity: PreventivePeriodicity;
    firstDueDate: string;
    areaId?: string | null;
  }): Promise<PreventivePlanRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let planId: string;
      try {
        const inserted = await client.query(
          `INSERT INTO preventive_plans (code, name, equipment, room_id, periodicity, area_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [input.code, input.name, input.equipment, input.roomId ?? null, input.periodicity, input.areaId ?? null],
        );
        planId = inserted.rows[0].id as string;
      } catch (error: unknown) {
        await client.query("ROLLBACK");
        if (isUniqueViolation(error)) {
          throw new MaintenanceError("PLAN_EXISTS", `Ya existe un plan con el código ${input.code}.`);
        }
        throw error;
      }
      await client.query(
        `INSERT INTO preventive_tasks (plan_id, due_date) VALUES ($1, $2)
         ON CONFLICT (plan_id, due_date) DO NOTHING`,
        [planId, input.firstDueDate],
      );
      const plan = await this.findPlanWith(client, planId);
      await client.query("COMMIT");
      return plan as PreventivePlanRecord;
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPlans(): Promise<PreventivePlanRecord[]> {
    const res = await this.pool.query(
      `SELECT p.*, r.room_number
         FROM preventive_plans p
         LEFT JOIN rooms r ON r.id = p.room_id
        ORDER BY p.active DESC, p.code ASC`,
    );
    return res.rows.map(mapPlan);
  }

  async findPlan(id: string): Promise<PreventivePlanRecord | null> {
    const res = await this.pool.query(
      `SELECT p.*, r.room_number
         FROM preventive_plans p
         LEFT JOIN rooms r ON r.id = p.room_id
        WHERE p.id = $1`,
      [id],
    );
    return res.rows.length > 0 ? mapPlan(res.rows[0]) : null;
  }

  async setPlanActive(id: string, active: boolean): Promise<PreventivePlanRecord | null> {
    const res = await this.pool.query(
      `UPDATE preventive_plans SET active = $2 WHERE id = $1 RETURNING id`,
      [id, active],
    );
    if (res.rows.length === 0) return null;
    return this.findPlan(id);
  }

  /** Tarea preventiva por id (con plan y área crítica unidos), o `null` si no existe. */
  async findTask(id: string): Promise<PreventiveTaskRecord | null> {
    return this.findTaskWith(this.pool, id);
  }

  async listTasks(
    filter: {
      planId?: string;
      status?: PreventiveTaskStatus;
      dueOnOrBefore?: string;
      assignedTo?: string;
    } = {},
  ): Promise<PreventiveTaskRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.planId) {
      values.push(filter.planId);
      where.push(`t.plan_id = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      where.push(`t.status = $${values.length}`);
    }
    if (filter.dueOnOrBefore) {
      values.push(filter.dueOnOrBefore);
      where.push(`t.due_date <= $${values.length}`);
    }
    if (filter.assignedTo) {
      values.push(filter.assignedTo);
      where.push(`t.assigned_to = $${values.length}`);
    }
    const res = await this.pool.query(
      `${TASK_SELECT} ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY t.due_date ASC`,
      values,
    );
    return res.rows.map(mapTask);
  }

  /**
   * Tareas **vencidas o de hoy** (aviso, D-54): pendientes, con fecha ≤ `date` y plan activo.
   * Es la fuente del aviso del tablero del técnico y de la notificación programada.
   */
  async listDueTasks(date: string): Promise<PreventiveTaskRecord[]> {
    const res = await this.pool.query(
      `${TASK_SELECT} WHERE t.status = 'PENDING' AND t.due_date <= $1 AND p.active = TRUE
       ORDER BY t.due_date ASC`,
      [date],
    );
    return res.rows.map(mapTask);
  }

  /**
   * Tablero del **terminal del técnico** (F5 · T5.5, D-C35): solo lo asignado a ese operario.
   * Combina incidencias asignadas (abiertas/en curso) y tareas preventivas asignadas y no cerradas.
   */
  async listTerminalTasks(
    operatorUsername: string,
    date: string,
  ): Promise<{ incidents: MaintenanceIncidentRecord[]; tasks: PreventiveTaskRecord[] }> {
    const [incidents, tasks] = await Promise.all([
      this.listIncidents({ openOnly: true }).then((rows) => rows.filter((row) => row.assignedTo === operatorUsername)),
      this.listTasks({ assignedTo: operatorUsername, dueOnOrBefore: date }).then((rows) =>
        rows.filter((row) => row.status === "PENDING"),
      ),
    ]);
    return { incidents, tasks };
  }

  /** Asigna una tarea preventiva a un operario de terminal (jefe/administración, F5/F9). */
  async assignTask(id: string, operatorUsername: string | null): Promise<PreventiveTaskRecord | null> {
    const res = await this.pool.query(
      `UPDATE preventive_tasks SET assigned_to = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'PENDING' RETURNING id`,
      [id, operatorUsername],
    );
    if (res.rows.length === 0) return null;
    return this.findTask(id);
  }

  /** Cierra una tarea como hecha y **programa la siguiente** según la periodicidad (D-54). */
  async completeTask(
    id: string,
    actor: string,
    notes?: string | null,
    options: CloseTaskOptions = {},
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    return this.closeTask(id, "DONE", actor, notes ?? null, options);
  }

  /** Marca una tarea como omitida y programa la siguiente. */
  async skipTask(
    id: string,
    actor: string,
    notes?: string | null,
    options: CloseTaskOptions = {},
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    return this.closeTask(id, "SKIPPED", actor, notes ?? null, options);
  }

  /** Tablero del técnico: incidencias abiertas, tareas vencidas y habitaciones bloqueadas (D-53/D-54). */
  async getBoard(date: string): Promise<MaintenanceBoard> {
    const [incidents, dueTasks, blockedRoomIds] = await Promise.all([
      this.listIncidents({ openOnly: true }),
      this.listDueTasks(date),
      this.listBlockedRoomIds(),
    ]);
    return { date, incidents, dueTasks, blockedRoomIds, generatedAt: new Date().toISOString() };
  }

  // ---------------------------------------------------------------------------
  // Áreas comunes (F1 · T1.9)
  // ---------------------------------------------------------------------------

  /** Catálogo de tipos de área común, ordenado para la interfaz. */
  async listAreaTypes(): Promise<MaintenanceAreaTypeRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM maintenance_area_types ORDER BY sort_order ASC, code ASC`,
    );
    return res.rows.map(mapAreaType);
  }

  /** Áreas comunes con su tipo; por defecto solo activas y sin filtrar por criticidad. */
  async listAreas(
    options: { includeInactive?: boolean; onlyCritical?: boolean } = {},
  ): Promise<MaintenanceAreaRecord[]> {
    const where: string[] = [];
    if (!(options.includeInactive ?? false)) where.push(`a.is_active = TRUE`);
    if (options.onlyCritical ?? false) where.push(`t.is_critical = TRUE`);
    const res = await this.pool.query(
      `${AREA_SELECT}${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""}
        ORDER BY t.sort_order ASC, a.name ASC`,
    );
    return res.rows.map(mapArea);
  }

  /** Áreas cuyo tipo es crítico y que siguen activas (criterio de F1). */
  async listCriticalAreas(): Promise<MaintenanceAreaRecord[]> {
    const res = await this.pool.query(
      `${AREA_SELECT} WHERE t.is_critical = TRUE AND a.is_active = TRUE
        ORDER BY t.sort_order ASC, a.name ASC`,
    );
    return res.rows.map(mapArea);
  }

  async findArea(id: string): Promise<MaintenanceAreaRecord | null> {
    const res = await this.pool.query(`${AREA_SELECT} WHERE a.id = $1`, [id]);
    return res.rows.length > 0 ? mapArea(res.rows[0]) : null;
  }

  /** Alta de un área común; el tipo debe existir en el catálogo. */
  async createArea(input: {
    areaTypeCode: string;
    name: string;
    locationNotes?: string | null;
  }): Promise<MaintenanceAreaRecord> {
    const type = await this.pool.query(
      `SELECT code, name_es, is_critical FROM maintenance_area_types WHERE code = $1`,
      [input.areaTypeCode],
    );
    if (type.rows.length === 0) {
      throw new MaintenanceError("AREA_TYPE_NOT_FOUND", `El tipo de área ${input.areaTypeCode} no existe.`);
    }
    const inserted = await this.pool.query(
      `INSERT INTO maintenance_areas (area_type_code, name, location_notes)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.areaTypeCode, input.name, input.locationNotes?.trim() || null],
    );
    return mapArea({
      ...inserted.rows[0],
      area_type_name: type.rows[0].name_es,
      is_critical: type.rows[0].is_critical,
    });
  }

  /** Actualiza nombre, notas o estado de un área; `AREA_NOT_FOUND` si no existe. */
  async updateArea(
    id: string,
    input: { name?: string; locationNotes?: string | null; isActive?: boolean },
  ): Promise<MaintenanceAreaRecord> {
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (input.name !== undefined) {
      values.push(input.name);
      sets.push(`name = $${values.length}`);
    }
    if (input.locationNotes !== undefined) {
      values.push(input.locationNotes?.trim() || null);
      sets.push(`location_notes = $${values.length}`);
    }
    if (input.isActive !== undefined) {
      values.push(input.isActive);
      sets.push(`is_active = $${values.length}`);
    }
    if (sets.length === 0) {
      const current = await this.findArea(id);
      if (current === null) {
        throw new MaintenanceError("AREA_NOT_FOUND", "El área no existe.");
      }
      return current;
    }
    const updated = await this.pool.query(
      `UPDATE maintenance_areas SET ${sets.join(", ")} WHERE id = $1 RETURNING id`,
      values,
    );
    if (updated.rows.length === 0) {
      throw new MaintenanceError("AREA_NOT_FOUND", "El área no existe.");
    }
    const area = await this.findArea(id);
    if (area === null) {
      throw new MaintenanceError("AREA_NOT_FOUND", "El área no existe.");
    }
    return area;
  }

  async listAreaTasks(
    areaId: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<MaintenanceAreaTaskRecord[]> {
    const where = [`area_id = $1`];
    if (!(options.includeInactive ?? false)) where.push(`is_active = TRUE`);
    const res = await this.pool.query(
      `SELECT * FROM maintenance_area_tasks WHERE ${where.join(" AND ")} ORDER BY label ASC`,
      [areaId],
    );
    return res.rows.map(mapAreaTask);
  }

  /** Alta de una tarea rutinaria; valida el área y la periodicidad en el dominio. */
  async createAreaTask(input: {
    areaId: string;
    label: string;
    periodicity: AreaPeriodicity;
    estimatedMinutes?: number | null;
    createdBy: string;
  }): Promise<MaintenanceAreaTaskRecord> {
    if (!(AREA_PERIODICITIES as readonly string[]).includes(input.periodicity)) {
      throw new MaintenanceError(
        "AREA_TASK_INVALID_PERIODICITY",
        `Periodicidad inválida: ${String(input.periodicity)}.`,
      );
    }
    const area = await this.pool.query(`SELECT id FROM maintenance_areas WHERE id = $1`, [input.areaId]);
    if (area.rows.length === 0) {
      throw new MaintenanceError("AREA_NOT_FOUND", "El área no existe.");
    }
    const inserted = await this.pool.query(
      `INSERT INTO maintenance_area_tasks (area_id, label, periodicity, estimated_minutes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.areaId, input.label, input.periodicity, input.estimatedMinutes ?? null, input.createdBy],
    );
    return mapAreaTask(inserted.rows[0]);
  }

  /** Activa o desactiva una tarea rutinaria; `AREA_TASK_NOT_FOUND` si no existe. */
  async setAreaTaskActive(taskId: string, isActive: boolean): Promise<MaintenanceAreaTaskRecord> {
    const res = await this.pool.query(
      `UPDATE maintenance_area_tasks SET is_active = $2 WHERE id = $1 RETURNING *`,
      [taskId, isActive],
    );
    if (res.rows.length === 0) {
      throw new MaintenanceError("AREA_TASK_NOT_FOUND", "La tarea de área no existe.");
    }
    return mapAreaTask(res.rows[0]);
  }

  /** Registra la ejecución de una tarea rutinaria (todavía sin verificar). */
  async registerAreaLog(input: {
    taskId: string;
    performedBy: string;
    notes?: string | null;
    evidencePath?: string | null;
  }): Promise<MaintenanceAreaLogRecord> {
    const task = await this.pool.query(`SELECT id FROM maintenance_area_tasks WHERE id = $1`, [input.taskId]);
    if (task.rows.length === 0) {
      throw new MaintenanceError("AREA_TASK_NOT_FOUND", "La tarea de área no existe.");
    }
    const inserted = await this.pool.query(
      `INSERT INTO maintenance_area_logs (task_id, performed_by, notes, evidence_path)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.taskId, input.performedBy, input.notes?.trim() || null, input.evidencePath ?? null],
    );
    return mapAreaLog(inserted.rows[0]);
  }

  /**
   * Verifica un registro de área fijando quién y (opcionalmente) la firma on-chain.
   *
   * Criterio aplicado: **un registro solo puede verificarse una vez**; el `UPDATE` exige
   * `verified_at IS NULL`. Si no afecta filas se distingue el motivo consultando la
   * existencia: no existe → «no existe»; existe y ya estaba verificado → «ya verificado».
   * Ambos motivos comparten el código `AREA_LOG_NOT_FOUND` y se cubren en el test.
   */
  async verifyAreaLog(
    logId: string,
    input: { verifiedBy: string; signatureId?: string | null },
  ): Promise<MaintenanceAreaLogRecord> {
    const res = await this.pool.query(
      `UPDATE maintenance_area_logs
          SET verified_by = $2, verified_at = NOW(), signature_id = $3
        WHERE id = $1 AND verified_at IS NULL
        RETURNING *`,
      [logId, input.verifiedBy, input.signatureId ?? null],
    );
    if (res.rows.length === 0) {
      const existing = await this.pool.query(`SELECT verified_at FROM maintenance_area_logs WHERE id = $1`, [logId]);
      if (existing.rows.length === 0) {
        throw new MaintenanceError("AREA_LOG_NOT_FOUND", "El registro de área no existe.");
      }
      throw new MaintenanceError("AREA_LOG_NOT_FOUND", "El registro de área ya estaba verificado.");
    }
    return mapAreaLog(res.rows[0]);
  }

  /** Historial de ejecuciones de áreas comunes, con filtros por área, rango y verificación. */
  async listAreaLogs(
    filter: { areaId?: string; from?: string | Date; to?: string | Date; pendingVerification?: boolean } = {},
  ): Promise<MaintenanceAreaLogRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.areaId) {
      values.push(filter.areaId);
      where.push(`t.area_id = $${values.length}`);
    }
    if (filter.from !== undefined) {
      values.push(filter.from);
      where.push(`l.performed_at >= $${values.length}`);
    }
    if (filter.to !== undefined) {
      values.push(filter.to);
      where.push(`l.performed_at <= $${values.length}`);
    }
    if (filter.pendingVerification ?? false) where.push(`l.verified_at IS NULL`);
    const res = await this.pool.query(
      `${AREA_LOG_SELECT}${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""}
        ORDER BY l.performed_at DESC`,
      values,
    );
    return res.rows.map(mapAreaLog);
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async closeTask(
    id: string,
    status: Extract<PreventiveTaskStatus, "DONE" | "SKIPPED">,
    actor: string,
    notes: string | null,
    options: CloseTaskOptions = {},
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT t.*, p.periodicity, p.active, COALESCE(at.is_critical, FALSE) AS is_critical
           FROM preventive_tasks t
           JOIN preventive_plans p ON p.id = t.plan_id
           LEFT JOIN maintenance_areas a ON a.id = p.area_id
           LEFT JOIN maintenance_area_types at ON at.code = a.area_type_code
          WHERE t.id = $1 FOR UPDATE OF t`,
        [id],
      );
      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new MaintenanceError("TASK_NOT_FOUND", "La tarea preventiva no existe.");
      }
      const row = current.rows[0];
      if ((row.status as string) !== "PENDING") {
        await client.query("ROLLBACK");
        throw new MaintenanceError("TASK_CLOSED", "La tarea ya estaba cerrada.");
      }
      // F5 · T5.5: el terminal envía el `updated_at` que leyó. Si otro operario cambió la tarea
      // mientras tanto, el cierre se rechaza en vez de pisar su trabajo (bloqueo optimista).
      if (options.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== null) {
        const expected = new Date(options.expectedUpdatedAt).getTime();
        const actual = row.updated_at instanceof Date ? row.updated_at.getTime() : new Date(row.updated_at as string).getTime();
        if (expected !== actual) {
          await client.query("ROLLBACK");
          throw new MaintenanceError(
            "OPTIMISTIC_LOCK_CONFLICT",
            "La tarea cambió desde que se abrió; recarga antes de cerrarla.",
          );
        }
      }
      // F4 · T4.5: una tarea de área crítica (o marcada `requires_signature`) solo se cierra con
      // una firma enlazada. La firma ya se validó (SIGNED + payload) en la capa de API.
      const requiresSignature = row.requires_signature === true || row.is_critical === true;
      if (requiresSignature && !options.signatureId) {
        await client.query("ROLLBACK");
        throw new MaintenanceError(
          "SIGNATURE_REQUIRED",
          "La tarea es de un área crítica y requiere firma EIP-712 para cerrarse.",
        );
      }
      await client.query(
        `UPDATE preventive_tasks
            SET status = $2, completed_by = $3, completed_at = NOW(), notes = COALESCE($4, notes),
                signature_id = COALESCE($5, signature_id),
                evidence_path = COALESCE($6, evidence_path),
                validation_status = COALESCE($7, validation_status),
                updated_at = NOW()
          WHERE id = $1`,
        [
          id,
          status,
          actor,
          notes,
          options.signatureId ?? null,
          options.evidencePath ?? null,
          options.validationStatus ?? null,
        ],
      );

      let nextId: string | null = null;
      if (row.active === true) {
        const nextDate = nextDueDate(isoDate(row.due_date), row.periodicity as PreventivePeriodicity);
        const next = await client.query(
          `INSERT INTO preventive_tasks (plan_id, due_date) VALUES ($1, $2)
           ON CONFLICT (plan_id, due_date) DO NOTHING
           RETURNING id`,
          [row.plan_id, nextDate],
        );
        if (next.rows.length > 0) nextId = next.rows[0].id as string;
        else {
          const existing = await client.query(
            `SELECT id FROM preventive_tasks WHERE plan_id = $1 AND due_date = $2`,
            [row.plan_id, nextDate],
          );
          nextId = (existing.rows[0]?.id as string | undefined) ?? null;
        }
      }

      const task = await this.findTaskWith(client, id);
      const nextTask = nextId ? await this.findTaskWith(client, nextId) : null;
      await client.query("COMMIT");
      return { task: task as PreventiveTaskRecord, next: nextTask };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async transitionIncident(
    id: string,
    status: MaintenanceStatus,
    eventType: MaintenanceEventType,
    actor: string,
    notes: string | null,
    extra: Record<string, unknown>,
  ): Promise<MaintenanceIncidentRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT status FROM maintenance_incidents WHERE id = $1 FOR UPDATE`, [id]);
      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      if (["RESOLVED", "CANCELLED"].includes(current.rows[0].status as string)) {
        await client.query("ROLLBACK");
        throw new MaintenanceError("INCIDENT_CLOSED", "La incidencia ya está cerrada.");
      }

      const sets = ["status = $2"];
      const values: unknown[] = [id, status];
      for (const [column, value] of Object.entries(extra)) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
      await client.query(`UPDATE maintenance_incidents SET ${sets.join(", ")} WHERE id = $1`, values);
      await client.query(
        `INSERT INTO maintenance_incident_events (incident_id, event_type, notes, actor)
         VALUES ($1, $2, $3, $4)`,
        [id, eventType, notes, actor],
      );
      const incident = await this.findIncidentWith(client, id);
      await client.query("COMMIT");
      return incident;
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async findIncidentWith(executor: Pool | PoolClient, id: string): Promise<MaintenanceIncidentRecord | null> {
    const res = await executor.query(
      `SELECT i.*, r.room_number FROM maintenance_incidents i
         LEFT JOIN rooms r ON r.id = i.room_id WHERE i.id = $1`,
      [id],
    );
    return res.rows.length > 0 ? mapIncident(res.rows[0]) : null;
  }

  private async findPlanWith(executor: Pool | PoolClient, id: string): Promise<PreventivePlanRecord | null> {
    const res = await executor.query(
      `SELECT p.*, r.room_number FROM preventive_plans p
         LEFT JOIN rooms r ON r.id = p.room_id WHERE p.id = $1`,
      [id],
    );
    return res.rows.length > 0 ? mapPlan(res.rows[0]) : null;
  }

  private async findTaskWith(executor: Pool | PoolClient, id: string): Promise<PreventiveTaskRecord | null> {
    const res = await executor.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
    return res.rows.length > 0 ? mapTask(res.rows[0]) : null;
  }
}

const TASK_SELECT = `SELECT t.*, p.code AS plan_code, p.name AS plan_name, p.equipment, p.periodicity,
          r.room_number, p.area_id, a.name AS area_name, COALESCE(at.is_critical, FALSE) AS is_critical
   FROM preventive_tasks t
   JOIN preventive_plans p ON p.id = t.plan_id
   LEFT JOIN rooms r ON r.id = p.room_id
   LEFT JOIN maintenance_areas a ON a.id = p.area_id
   LEFT JOIN maintenance_area_types at ON at.code = a.area_type_code`;

const AREA_SELECT = `SELECT a.*, t.name_es AS area_type_name, t.is_critical
   FROM maintenance_areas a
   JOIN maintenance_area_types t ON t.code = a.area_type_code`;

const AREA_LOG_SELECT = `SELECT l.*, t.area_id, t.label AS task_label, a.name AS area_name
   FROM maintenance_area_logs l
   JOIN maintenance_area_tasks t ON t.id = l.task_id
   JOIN maintenance_areas a ON a.id = t.area_id`;

// -----------------------------------------------------------------------------
// Traducción snake_case → camelCase
// -----------------------------------------------------------------------------

function mapIncident(row: QueryResultRow): MaintenanceIncidentRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    roomNumber: row.room_number === null || row.room_number === undefined ? null : Number(row.room_number),
    kind: row.kind as string,
    description: (row.description as string | null) ?? null,
    priority: row.priority as MaintenancePriority,
    status: row.status as MaintenanceStatus,
    blocksSale: row.blocks_sale as boolean,
    reportedBy: row.reported_by as string,
    reportedByRole: (row.reported_by_role as string | null) ?? null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    createdAt: row.created_at as Date,
    resolvedAt: (row.resolved_at as Date | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    areaId: (row.area_id as string | null) ?? null,
  };
}

function mapIncidentEvent(row: QueryResultRow): MaintenanceIncidentEventRecord {
  return {
    id: row.id as string,
    incidentId: row.incident_id as string,
    eventType: row.event_type as MaintenanceEventType,
    notes: (row.notes as string | null) ?? null,
    actor: row.actor as string,
    createdAt: row.created_at as Date,
  };
}

function mapPlan(row: QueryResultRow): PreventivePlanRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    equipment: row.equipment as string,
    roomId: (row.room_id as string | null) ?? null,
    roomNumber: row.room_number === null || row.room_number === undefined ? null : Number(row.room_number),
    periodicity: row.periodicity as PreventivePeriodicity,
    active: row.active as boolean,
    createdAt: row.created_at as Date,
    areaId: (row.area_id as string | null) ?? null,
  };
}

function mapTask(row: QueryResultRow): PreventiveTaskRecord {
  const dueDate = isoDate(row.due_date);
  const status = row.status as PreventiveTaskStatus;
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    dueDate,
    status,
    completedBy: (row.completed_by as string | null) ?? null,
    completedAt: (row.completed_at as Date | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    planCode: (row.plan_code as string | null) ?? null,
    planName: (row.plan_name as string | null) ?? null,
    equipment: (row.equipment as string | null) ?? null,
    periodicity: (row.periodicity as PreventivePeriodicity | null) ?? null,
    roomNumber: row.room_number === null || row.room_number === undefined ? null : Number(row.room_number),
    overdue: status === "PENDING" && dueDate <= new Date().toISOString().slice(0, 10),
    areaId: (row.area_id as string | null) ?? null,
    areaName: (row.area_name as string | null) ?? null,
    isCritical: row.is_critical === true,
    requiresSignature: row.requires_signature === true || row.is_critical === true,
    signatureId: (row.signature_id as string | null) ?? null,
    evidencePath: (row.evidence_path as string | null) ?? null,
    assignedTo: (row.assigned_to as string | null) ?? null,
    validationStatus:
      (row.validation_status as PreventiveTaskRecord["validationStatus"] | null) ?? null,
    updatedAt: (row.updated_at as Date | null) ?? null,
  };
}

/** Normaliza `DATE` (que `pg` devuelve como `Date` o cadena) a `YYYY-MM-DD`. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapAreaType(row: QueryResultRow): MaintenanceAreaTypeRecord {
  return {
    code: row.code as string,
    nameEs: row.name_es as string,
    nameEn: row.name_en as string,
    nameRu: row.name_ru as string,
    isCritical: row.is_critical === true,
    sortOrder: Number(row.sort_order),
  };
}

function mapArea(row: QueryResultRow): MaintenanceAreaRecord {
  return {
    id: row.id as string,
    areaTypeCode: row.area_type_code as string,
    areaTypeName: (row.area_type_name as string | null) ?? null,
    isCritical: row.is_critical === true,
    name: row.name as string,
    locationNotes: (row.location_notes as string | null) ?? null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
  };
}

function mapAreaTask(row: QueryResultRow): MaintenanceAreaTaskRecord {
  return {
    id: row.id as string,
    areaId: row.area_id as string,
    label: row.label as string,
    periodicity: row.periodicity as AreaPeriodicity,
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? null
        : Number(row.estimated_minutes),
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
  };
}

function mapAreaLog(row: QueryResultRow): MaintenanceAreaLogRecord {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    performedBy: row.performed_by as string,
    performedAt: row.performed_at as Date,
    notes: (row.notes as string | null) ?? null,
    evidencePath: (row.evidence_path as string | null) ?? null,
    verifiedBy: (row.verified_by as string | null) ?? null,
    verifiedAt: (row.verified_at as Date | null) ?? null,
    signatureId: (row.signature_id as string | null) ?? null,
    areaId: (row.area_id as string | null) ?? null,
    taskLabel: (row.task_label as string | null) ?? null,
    areaName: (row.area_name as string | null) ?? null,
  };
}
