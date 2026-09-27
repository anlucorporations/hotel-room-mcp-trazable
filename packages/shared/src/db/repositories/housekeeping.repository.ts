import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de Housekeeping (Suite Administración → Housekeeping y ruta `/housekeeping`,
 * D-19, D-30, D-48…D-51, D-62, D-64).
 *
 * Cubre el ciclo completo del servicio de habitaciones:
 *
 *   1. **Turnos** (`housekeeping_shifts`): un turno por día y etiqueta (mañana/tarde/noche).
 *   2. **Reparto automático** (`autoAssign`, D-48): las habitaciones a limpiar se deducen de la
 *      ocupación —las que tienen salida ese día, las sucias y las ocupadas— y se reparten por turnos
 *      rotando entre las camareras; el supervisor puede **ajustar a mano** (`assignRoom`/`unassignRoom`).
 *   3. **Estados operativos** (`housekeeping_room_logs` + `rooms.operational_status`, D-19): cada
 *      cambio deja traza con el valor anterior real.
 *   4. **Lencería y suministros** (`supply_items`, `supply_stock_movements`, D-51): al terminar una
 *      habitación se descuenta el consumo y, si un artículo baja de su umbral, se devuelve la alerta.
 *
 * **Sin PII** (ADR-20/RNF-30): aquí no se guarda ningún dato de viajeros; `assignee` es el nombre de
 * la camarera (personal del hotel) y el contacto del huésped nunca entra en este repositorio.
 *
 * El repositorio no decide el rol que puede llamar a cada operación: eso vive en el guard de la API.
 */

/** Etiquetas de turno admitidas (`housekeeping_shifts.label`). */
export type HousekeepingShiftLabel = "MANANA" | "TARDE" | "NOCHE";

/** Estados de una asignación (`housekeeping_assignments.status`). */
export type HousekeepingAssignmentStatus = "PENDING" | "IN_PROGRESS" | "DONE";

/** Motivo por el que una habitación entra en el reparto del día (D-48). */
export type RoomCleaningReason = "CHECKOUT" | "DIRTY" | "STAYOVER";

/** Causa de un movimiento de suministros (`supply_stock_movements.reason`). */
export type SupplyMovementReason = "ROOM_CLEANED" | "GUEST_CHECKIN" | "RESTOCK" | "ADJUSTMENT";

export interface HousekeepingShiftRecord {
  id: string;
  /** Fecha ISO `YYYY-MM-DD`. */
  shiftDate: string;
  label: HousekeepingShiftLabel;
  supervisor: string;
  createdAt: Date;
}

export interface HousekeepingAssignmentRecord {
  id: string;
  shiftId: string;
  roomId: string;
  /** Número de habitación, unido para pintar el tablero sin una consulta extra. */
  roomNumber: number | null;
  assignee: string;
  status: HousekeepingAssignmentStatus;
  assignedAt: Date;
  completedAt: Date | null;
}

/** Habitación candidata a limpieza en una fecha, con el motivo (ocupación). */
export interface RoomCleaningCandidate {
  roomId: string;
  roomNumber: number;
  roomType: string;
  operationalStatus: string;
  reason: RoomCleaningReason;
}

export interface SupplyItemRecord {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string | null;
  nameRu: string | null;
  unit: string;
  stockQty: number;
  thresholdQty: number;
  updatedAt: Date;
}

export interface SupplyMovementRecord {
  id: string;
  itemId: string;
  /** Consumo negativo, reposición positiva. */
  deltaQty: number;
  reason: SupplyMovementReason;
  roomId: string | null;
  reservationId: string | null;
  createdBy: string;
  createdAt: Date;
}

/** Consumo solicitado para un artículo concreto, por código (`SOAP`, `PAPER`…). */
export interface SupplyConsumption {
  code: string;
  quantity: number;
}

/** Consumo real aplicado a un artículo (puede ser menor si no había existencias). */
export interface SupplyConsumptionResult {
  item: SupplyItemRecord;
  consumed: number;
  /** `true` si tras el movimiento queda en o por debajo del umbral (D-51/D-64). */
  lowStock: boolean;
}

export interface CompleteAssignmentResult {
  assignment: HousekeepingAssignmentRecord;
  roomNumber: number;
  /** Artículos que han quedado bajo umbral tras el consumo. */
  lowStock: SupplyItemRecord[];
}

export interface HousekeepingBoard {
  /** Fecha del tablero (`YYYY-MM-DD`). */
  date: string;
  shifts: HousekeepingShiftRecord[];
  assignments: HousekeepingAssignmentRecord[];
  lowStock: SupplyItemRecord[];
  generatedAt: string;
}

export type HousekeepingErrorCode =
  | "SHIFT_EXISTS"
  | "SHIFT_NOT_FOUND"
  | "ASSIGNMENT_NOT_FOUND"
  | "ASSIGNMENT_DONE"
  | "ROOM_NOT_FOUND"
  | "SUPPLY_NOT_FOUND";

export class HousekeepingError extends Error {
  constructor(
    readonly code: HousekeepingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HousekeepingError";
  }
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/**
 * Consumo por defecto al limpiar una habitación (D-51). Es una política de negocio explícita: si el
 * hotel cambia sus consumos, se cambia aquí y las pruebas lo reflejan. Nunca descuenta más de lo que
 * hay: el consumo real se limita a las existencias y se devuelve el importe aplicado.
 */
export const DEFAULT_CLEANING_CONSUMPTION: readonly SupplyConsumption[] = [
  { code: "SOAP", quantity: 2 },
  { code: "PAPER", quantity: 1 },
  { code: "TOWELS", quantity: 2 },
  { code: "SHEETS", quantity: 1 },
];

export class HousekeepingRepository {
  constructor(private pool: Pool = getDbPool()) {}

  // ---------------------------------------------------------------------------
  // Turnos
  // ---------------------------------------------------------------------------

  /** Crea el turno del día. La clave `(shift_date, label)` es única → error de negocio si repite. */
  async createShift(input: {
    shiftDate: string;
    label: HousekeepingShiftLabel;
    supervisor: string;
  }): Promise<HousekeepingShiftRecord> {
    try {
      const res = await this.pool.query(
        `INSERT INTO housekeeping_shifts (shift_date, label, supervisor)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.shiftDate, input.label, input.supervisor],
      );
      return mapShift(res.rows[0]);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new HousekeepingError(
          "SHIFT_EXISTS",
          `Ya existe el turno ${input.label} del ${input.shiftDate} (solo uno por día y etiqueta).`,
        );
      }
      throw error;
    }
  }

  async findShift(shiftDate: string, label: HousekeepingShiftLabel): Promise<HousekeepingShiftRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM housekeeping_shifts WHERE shift_date = $1 AND label = $2`,
      [shiftDate, label],
    );
    return res.rows.length > 0 ? mapShift(res.rows[0]) : null;
  }

  async getShift(id: string): Promise<HousekeepingShiftRecord | null> {
    const res = await this.pool.query(`SELECT * FROM housekeeping_shifts WHERE id = $1`, [id]);
    return res.rows.length > 0 ? mapShift(res.rows[0]) : null;
  }

  async listShifts(shiftDate: string): Promise<HousekeepingShiftRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM housekeeping_shifts WHERE shift_date = $1 ORDER BY
         CASE label WHEN 'MANANA' THEN 1 WHEN 'TARDE' THEN 2 ELSE 3 END`,
      [shiftDate],
    );
    return res.rows.map(mapShift);
  }

  // ---------------------------------------------------------------------------
  // Ocupación y reparto (D-48)
  // ---------------------------------------------------------------------------

  /**
   * Habitaciones a limpiar en una fecha, deducidas de la **ocupación**:
   * salida ese día (CHECKOUT), sucia (DIRTY) o en estancia (STAYOVER).
   */
  async listRoomsToClean(date: string): Promise<RoomCleaningCandidate[]> {
    const res = await this.pool.query(
      `SELECT r.id, r.room_number, r.room_type, r.operational_status,
              EXISTS (
                SELECT 1 FROM reservations res
                 WHERE res.room_id = r.id
                   AND res.check_out_date = $1
                   AND res.status IN ('CONFIRMED', 'COMPLETED')
              ) AS checks_out
         FROM rooms r
        WHERE r.archived_at IS NULL
          AND r.publication_status <> 'OUT_OF_SERVICE'
          AND (
            r.operational_status IN ('DIRTY', 'OCCUPIED')
            OR EXISTS (
              SELECT 1 FROM reservations res
               WHERE res.room_id = r.id
                 AND res.check_out_date = $1
                 AND res.status IN ('CONFIRMED', 'COMPLETED')
            )
          )
        ORDER BY r.room_number ASC`,
      [date],
    );
    return res.rows.map(mapCandidate);
  }

  /**
   * Reparto automático (D-48): toma las habitaciones a limpiar del turno y las reparte **rotando**
   * entre las camareras indicadas, sin pisar las asignaciones que ya existan (idempotente). El
   * supervisor puede luego mover habitaciones a mano.
   */
  async autoAssign(shiftId: string, assignees: readonly string[]): Promise<HousekeepingAssignmentRecord[]> {
    const shift = await this.getShift(shiftId);
    if (!shift) throw new HousekeepingError("SHIFT_NOT_FOUND", "El turno no existe.");

    const people = assignees.map((name) => name.trim()).filter((name) => name.length > 0);
    if (people.length === 0) {
      throw new HousekeepingError("ASSIGNMENT_NOT_FOUND", "Indica al menos una camarera para el reparto.");
    }

    const candidates = await this.listRoomsToClean(shift.shiftDate);
    const existing = await this.listAssignments(shiftId);
    const already = new Set(existing.map((assignment) => assignment.roomId));

    let cursor = existing.length % people.length;
    for (const candidate of candidates) {
      if (already.has(candidate.roomId)) continue;
      const assignee = people[cursor % people.length] as string;
      cursor += 1;
      await this.pool.query(
        `INSERT INTO housekeeping_assignments (shift_id, room_id, assignee, status)
         VALUES ($1, $2, $3, 'PENDING')
         ON CONFLICT (shift_id, room_id) DO NOTHING`,
        [shiftId, candidate.roomId, assignee],
      );
    }
    return this.listAssignments(shiftId);
  }

  /** Ajuste manual: asigna (o reasigna) una habitación a una persona dentro del turno. */
  async assignRoom(input: {
    shiftId: string;
    roomId: string;
    assignee: string;
  }): Promise<HousekeepingAssignmentRecord> {
    const res = await this.pool.query(
      `INSERT INTO housekeeping_assignments (shift_id, room_id, assignee, status)
       VALUES ($1, $2, $3, 'PENDING')
       ON CONFLICT (shift_id, room_id)
       DO UPDATE SET assignee = EXCLUDED.assignee,
                     status = CASE WHEN housekeeping_assignments.status = 'DONE'
                                   THEN 'DONE' ELSE 'PENDING' END
       RETURNING *`,
      [input.shiftId, input.roomId, input.assignee],
    );
    return mapAssignment(res.rows[0]);
  }

  /** Retira una habitación del reparto del turno (si aún no está terminada). */
  async unassignRoom(shiftId: string, roomId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM housekeeping_assignments
        WHERE shift_id = $1 AND room_id = $2 AND status <> 'DONE'`,
      [shiftId, roomId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listAssignments(shiftId: string): Promise<HousekeepingAssignmentRecord[]> {
    const res = await this.pool.query(
      `SELECT a.*, r.room_number
         FROM housekeeping_assignments a
         LEFT JOIN rooms r ON r.id = a.room_id
        WHERE a.shift_id = $1
        ORDER BY r.room_number ASC`,
      [shiftId],
    );
    return res.rows.map(mapAssignment);
  }

  /** Asignaciones de un día completo (todos los turnos), para el tablero y el SSE (D-30). */
  async listAssignmentsByDate(date: string): Promise<HousekeepingAssignmentRecord[]> {
    const res = await this.pool.query(
      `SELECT a.*, r.room_number
         FROM housekeeping_assignments a
         JOIN housekeeping_shifts s ON s.id = a.shift_id
         LEFT JOIN rooms r ON r.id = a.room_id
        WHERE s.shift_date = $1
        ORDER BY r.room_number ASC`,
      [date],
    );
    return res.rows.map(mapAssignment);
  }

  async getAssignment(id: string): Promise<HousekeepingAssignmentRecord | null> {
    const res = await this.pool.query(
      `SELECT a.*, r.room_number
         FROM housekeeping_assignments a
         LEFT JOIN rooms r ON r.id = a.room_id
        WHERE a.id = $1`,
      [id],
    );
    return res.rows.length > 0 ? mapAssignment(res.rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // Estados operativos (D-19)
  // ---------------------------------------------------------------------------

  /** Marca una asignación como «en curso». */
  async startAssignment(id: string): Promise<HousekeepingAssignmentRecord | null> {
    const res = await this.pool.query(
      `UPDATE housekeeping_assignments
          SET status = 'IN_PROGRESS'
        WHERE id = $1 AND status <> 'DONE'
        RETURNING *`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return this.getAssignment(id);
  }

  /**
   * Termina la habitación: marca la asignación `DONE`, deja la habitación `CLEAN` con su traza en
   * `housekeeping_room_logs` y descuenta el consumo de lencería (D-51). Todo en una transacción.
   */
  async completeAssignment(
    id: string,
    actor: string,
    consumption: readonly SupplyConsumption[] = DEFAULT_CLEANING_CONSUMPTION,
  ): Promise<CompleteAssignmentResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const locked = await client.query(
        `SELECT a.*, r.room_number, r.operational_status
           FROM housekeeping_assignments a
           JOIN rooms r ON r.id = a.room_id
          WHERE a.id = $1
          FOR UPDATE OF a`,
        [id],
      );
      if (locked.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new HousekeepingError("ASSIGNMENT_NOT_FOUND", "La asignación no existe.");
      }
      const row = locked.rows[0];
      if ((row.status as string) === "DONE") {
        await client.query("ROLLBACK");
        throw new HousekeepingError("ASSIGNMENT_DONE", "La habitación ya se dio por limpia.");
      }

      const updated = await client.query(
        `UPDATE housekeeping_assignments
            SET status = 'DONE', completed_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id],
      );

      await client.query(
        `INSERT INTO housekeeping_room_logs
            (room_id, assignment_id, from_value, to_value, changed_by)
         VALUES ($1, $2, $3, 'CLEAN', $4)`,
        [row.room_id, id, (row.operational_status as string | null) ?? null, actor],
      );
      await client.query(
        `UPDATE rooms SET operational_status = 'CLEAN', updated_at = NOW() WHERE id = $1`,
        [row.room_id],
      );

      const results = await applyConsumption(client, row.room_id as string, consumption, actor);
      const lowStock = results.filter((result) => result.lowStock).map((result) => result.item);

      await client.query("COMMIT");
      return {
        assignment: mapAssignment({ ...updated.rows[0], room_number: row.room_number }),
        roomNumber: Number(row.room_number),
        lowStock,
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Cambia el estado operativo de una habitación con traza (DIRTY/OCCUPIED/CLEAN). */
  async setRoomOperationalStatus(
    roomId: string,
    status: string,
    actor: string,
    assignmentId?: string | null,
  ): Promise<RoomCleaningCandidate | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT id, room_number, room_type, operational_status FROM rooms
          WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
        [roomId],
      );
      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new HousekeepingError("ROOM_NOT_FOUND", "La habitación no existe o está archivada.");
      }
      const from = current.rows[0].operational_status as string;
      await client.query(`UPDATE rooms SET operational_status = $2, updated_at = NOW() WHERE id = $1`, [
        roomId,
        status,
      ]);
      if (from !== status) {
        await client.query(
          `INSERT INTO housekeeping_room_logs
              (room_id, assignment_id, from_value, to_value, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [roomId, assignmentId ?? null, from, status, actor],
        );
      }
      await client.query("COMMIT");
      return {
        roomId,
        roomNumber: Number(current.rows[0].room_number),
        roomType: current.rows[0].room_type as string,
        operationalStatus: status,
        reason: status === "DIRTY" ? "DIRTY" : "STAYOVER",
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Últimos cambios de estado operativo, para el feed en tiempo real (D-30). */
  async listRecentRoomLogs(date: string, limit = 50): Promise<QueryResultRow[]> {
    const res = await this.pool.query(
      `SELECT l.id, l.room_id, r.room_number, l.from_value, l.to_value, l.changed_by, l.changed_at
         FROM housekeeping_room_logs l
         JOIN rooms r ON r.id = l.room_id
        WHERE l.changed_at::date = $1
        ORDER BY l.changed_at DESC
        LIMIT $2`,
      [date, limit],
    );
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // Lencería y suministros (D-51, D-64)
  // ---------------------------------------------------------------------------

  async listSupplyItems(): Promise<SupplyItemRecord[]> {
    const res = await this.pool.query(`SELECT * FROM supply_items ORDER BY code ASC`);
    return res.rows.map(mapSupplyItem);
  }

  /** Artículos en o por debajo de su umbral crítico (panel de Lencería). */
  async listLowStock(): Promise<SupplyItemRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM supply_items
        WHERE threshold_qty > 0 AND stock_qty <= threshold_qty
        ORDER BY (stock_qty - threshold_qty) ASC, code ASC`,
    );
    return res.rows.map(mapSupplyItem);
  }

  /** Reposición marcada por el responsable: suma stock y deja movimiento (D-51). */
  async restock(itemId: string, quantity: number, actor: string): Promise<SupplyItemRecord> {
    if (quantity <= 0) {
      throw new HousekeepingError("SUPPLY_NOT_FOUND", "La reposición debe ser mayor que cero.");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE supply_items SET stock_qty = stock_qty + $2, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [itemId, quantity],
      );
      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new HousekeepingError("SUPPLY_NOT_FOUND", "El artículo no existe.");
      }
      await client.query(
        `INSERT INTO supply_stock_movements (item_id, delta_qty, reason, created_by)
         VALUES ($1, $2, 'RESTOCK', $3)`,
        [itemId, quantity, actor],
      );
      await client.query("COMMIT");
      return mapSupplyItem(updated.rows[0]);
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Consumo manual (ajuste del responsable u otro motivo), sin tocar habitaciones. */
  async consumeSupplies(
    lines: readonly SupplyConsumption[],
    actor: string,
    reason: SupplyMovementReason = "ADJUSTMENT",
    roomId?: string | null,
  ): Promise<SupplyConsumptionResult[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results = await applyConsumption(client, roomId ?? null, lines, actor, reason);
      await client.query("COMMIT");
      return results;
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listMovements(itemId: string, limit = 50): Promise<SupplyMovementRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM supply_stock_movements WHERE item_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [itemId, limit],
    );
    return res.rows.map(mapMovement);
  }

  /**
   * Instantánea del tablero del día: turnos, asignaciones y alertas de stock. Es la fuente única del
   * tablero y del flujo SSE (D-30), de modo que todos los puestos ven lo mismo.
   */
  async getBoard(date: string): Promise<HousekeepingBoard> {
    const [shifts, assignments, lowStock] = await Promise.all([
      this.listShifts(date),
      this.listAssignmentsByDate(date),
      this.listLowStock(),
    ]);
    return { date, shifts, assignments, lowStock, generatedAt: new Date().toISOString() };
  }
}

/**
 * Aplica un consumo dentro de una transacción abierta. **Nunca deja el stock en negativo** (el
 * `CHECK` de la tabla lo impediría): descuenta como mucho lo disponible y registra el consumo real.
 */
async function applyConsumption(
  client: PoolClient,
  roomId: string | null,
  lines: readonly SupplyConsumption[],
  actor: string,
  reason: SupplyMovementReason = "ROOM_CLEANED",
): Promise<SupplyConsumptionResult[]> {
  const results: SupplyConsumptionResult[] = [];
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const current = await client.query(`SELECT * FROM supply_items WHERE code = $1 FOR UPDATE`, [line.code]);
    if (current.rows.length === 0) continue;
    const before = mapSupplyItem(current.rows[0]);
    const consumed = Math.min(before.stockQty, line.quantity);
    let item = before;
    if (consumed > 0) {
      const updated = await client.query(
        `UPDATE supply_items SET stock_qty = stock_qty - $2, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [before.id, consumed],
      );
      item = mapSupplyItem(updated.rows[0]);
      await client.query(
        `INSERT INTO supply_stock_movements (item_id, delta_qty, reason, room_id, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.id, -consumed, reason, roomId, actor],
      );
    }
    results.push({ item, consumed, lowStock: item.thresholdQty > 0 && item.stockQty <= item.thresholdQty });
  }
  return results;
}

// -----------------------------------------------------------------------------
// Traducción snake_case → camelCase
// -----------------------------------------------------------------------------

function mapShift(row: QueryResultRow): HousekeepingShiftRecord {
  return {
    id: row.id as string,
    shiftDate: isoDate(row.shift_date),
    label: row.label as HousekeepingShiftLabel,
    supervisor: row.supervisor as string,
    createdAt: row.created_at as Date,
  };
}

function mapAssignment(row: QueryResultRow): HousekeepingAssignmentRecord {
  return {
    id: row.id as string,
    shiftId: row.shift_id as string,
    roomId: row.room_id as string,
    roomNumber: row.room_number === null || row.room_number === undefined ? null : Number(row.room_number),
    assignee: row.assignee as string,
    status: row.status as HousekeepingAssignmentStatus,
    assignedAt: row.assigned_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
  };
}

function mapCandidate(row: QueryResultRow): RoomCleaningCandidate {
  const operational = row.operational_status as string;
  const reason: RoomCleaningReason = row.checks_out
    ? "CHECKOUT"
    : operational === "DIRTY"
      ? "DIRTY"
      : "STAYOVER";
  return {
    roomId: row.id as string,
    roomNumber: Number(row.room_number),
    roomType: row.room_type as string,
    operationalStatus: operational,
    reason,
  };
}

function mapSupplyItem(row: QueryResultRow): SupplyItemRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    nameEs: row.name_es as string,
    nameEn: (row.name_en as string | null) ?? null,
    nameRu: (row.name_ru as string | null) ?? null,
    unit: row.unit as string,
    stockQty: Number(row.stock_qty),
    thresholdQty: Number(row.threshold_qty),
    updatedAt: row.updated_at as Date,
  };
}

function mapMovement(row: QueryResultRow): SupplyMovementRecord {
  return {
    id: row.id as string,
    itemId: row.item_id as string,
    deltaQty: Number(row.delta_qty),
    reason: row.reason as SupplyMovementReason,
    roomId: (row.room_id as string | null) ?? null,
    reservationId: (row.reservation_id as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
  };
}

/** Normaliza `DATE` (que `pg` devuelve como `Date` o cadena) a `YYYY-MM-DD`. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
