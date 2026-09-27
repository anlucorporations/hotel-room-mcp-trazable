import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import {
  PREVENTIVE_PERIOD_DAYS,
  type MaintenancePriority,
  type MaintenanceStatus,
  type PreventivePeriodicity,
} from "../../domain/maintenance";

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
  assignedTo: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export interface MaintenanceIncidentEventRecord {
  id: string;
  incidentId: string;
  eventType: MaintenanceEventType;
  notes: string | null;
  actor: string;
  createdAt: Date;
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
  | "TASK_CLOSED";

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
           (room_id, kind, description, priority, status, blocks_sale, reported_by)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6)
         RETURNING *`,
        [
          input.roomId,
          input.kind,
          input.description?.trim() || null,
          input.priority ?? "MEDIUM",
          input.blocksSale ?? true,
          input.reportedBy,
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
  }): Promise<PreventivePlanRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let planId: string;
      try {
        const inserted = await client.query(
          `INSERT INTO preventive_plans (code, name, equipment, room_id, periodicity)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [input.code, input.name, input.equipment, input.roomId ?? null, input.periodicity],
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

  async listTasks(
    filter: { planId?: string; status?: PreventiveTaskStatus; dueOnOrBefore?: string } = {},
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

  /** Cierra una tarea como hecha y **programa la siguiente** según la periodicidad (D-54). */
  async completeTask(
    id: string,
    actor: string,
    notes?: string | null,
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    return this.closeTask(id, "DONE", actor, notes ?? null);
  }

  /** Marca una tarea como omitida y programa la siguiente. */
  async skipTask(
    id: string,
    actor: string,
    notes?: string | null,
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    return this.closeTask(id, "SKIPPED", actor, notes ?? null);
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
  // Internos
  // ---------------------------------------------------------------------------

  private async closeTask(
    id: string,
    status: Extract<PreventiveTaskStatus, "DONE" | "SKIPPED">,
    actor: string,
    notes: string | null,
  ): Promise<{ task: PreventiveTaskRecord; next: PreventiveTaskRecord | null }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT t.*, p.periodicity, p.active FROM preventive_tasks t
           JOIN preventive_plans p ON p.id = t.plan_id
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
      await client.query(
        `UPDATE preventive_tasks
            SET status = $2, completed_by = $3, completed_at = NOW(), notes = COALESCE($4, notes)
          WHERE id = $1`,
        [id, status, actor, notes],
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

const TASK_SELECT = `SELECT t.*, p.code AS plan_code, p.name AS plan_name, p.equipment, p.periodicity, r.room_number
   FROM preventive_tasks t
   JOIN preventive_plans p ON p.id = t.plan_id
   LEFT JOIN rooms r ON r.id = p.room_id`;

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
    assignedTo: (row.assigned_to as string | null) ?? null,
    createdAt: row.created_at as Date,
    resolvedAt: (row.resolved_at as Date | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
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
  };
}

/** Normaliza `DATE` (que `pg` devuelve como `Date` o cadena) a `YYYY-MM-DD`. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
