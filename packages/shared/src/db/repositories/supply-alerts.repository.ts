import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import type { SupplyAlertRecord } from "./housekeeping.repository";
import { isBelowThreshold, shouldCloseAlert } from "../../domain/supplies";

/**
 * Motor de **alertas de suministros** (F8 · T8.1/T8.2 · D-C33, CU-V-25/30).
 *
 * - `syncForItem` concilia el stock con la alerta: abre cuando el artículo queda en o por debajo de su
 *   umbral (idempotente: una sola alerta `OPEN` por artículo) y cierra cuando se repone por encima.
 * - `dueReminders`/`markReminded` implementan el **recordatorio diario persistente** (`last_reminded_at`),
 *   que sobrevive a reinicios del worker (no un contador en memoria).
 *
 * No hay índice único parcial en el esquema (`supply_alerts` sin UNIQUE parcial), así que la unicidad
 * de la alerta abierta se garantiza aquí con una lectura previa dentro de la misma operación.
 */

export interface SupplyAlertWithItem extends SupplyAlertRecord {
  readonly itemCode: string;
  readonly itemName: string;
  readonly unit: string;
  readonly stockQty: number;
  readonly thresholdQty: number;
}

export interface SyncAlertResult {
  readonly alert: SupplyAlertWithItem | null;
  readonly action: "OPENED" | "CLOSED" | "UNCHANGED";
}

const ALERT_WITH_ITEM_SELECT = `SELECT a.*, i.code AS item_code, i.name_es AS item_name, i.unit,
          i.stock_qty, i.threshold_qty
     FROM supply_alerts a
     JOIN supply_items i ON i.id = a.supply_item_id`;

function mapAlertWithItem(row: QueryResultRow): SupplyAlertWithItem {
  return {
    id: row.id as string,
    supplyItemId: row.supply_item_id as string,
    status: row.status as SupplyAlertWithItem["status"],
    openedAt: row.opened_at as Date,
    lastRemindedAt: (row.last_reminded_at as Date | null) ?? null,
    closedAt: (row.closed_at as Date | null) ?? null,
    itemCode: row.item_code as string,
    itemName: row.item_name as string,
    unit: row.unit as string,
    stockQty: Number(row.stock_qty),
    thresholdQty: Number(row.threshold_qty),
  };
}

export class SupplyAlertsRepository {
  constructor(private readonly pool: Pool = getDbPool()) {}

  async listOpen(): Promise<SupplyAlertWithItem[]> {
    const res = await this.pool.query(
      `${ALERT_WITH_ITEM_SELECT} WHERE a.status = 'OPEN' ORDER BY a.opened_at ASC`,
    );
    return res.rows.map(mapAlertWithItem);
  }

  async findOpenForItem(itemId: string): Promise<SupplyAlertWithItem | null> {
    const res = await this.pool.query(
      `${ALERT_WITH_ITEM_SELECT} WHERE a.supply_item_id = $1 AND a.status = 'OPEN' LIMIT 1`,
      [itemId],
    );
    return res.rows.length > 0 ? mapAlertWithItem(res.rows[0]) : null;
  }

  /** Concilia la alerta de un artículo con su stock actual. */
  async syncForItem(itemId: string): Promise<SyncAlertResult> {
    const item = await this.pool.query(
      `SELECT id, stock_qty, threshold_qty FROM supply_items WHERE id = $1`,
      [itemId],
    );
    if (item.rows.length === 0) return { alert: null, action: "UNCHANGED" };
    const state = {
      stockQty: Number(item.rows[0].stock_qty),
      thresholdQty: Number(item.rows[0].threshold_qty),
    };
    const open = await this.findOpenForItem(itemId);

    if (isBelowThreshold(state)) {
      if (open) return { alert: open, action: "UNCHANGED" };
      const inserted = await this.pool.query(
        `INSERT INTO supply_alerts (supply_item_id, status) VALUES ($1, 'OPEN') RETURNING id`,
        [itemId],
      );
      const alert = await this.findOpenForItem(itemId);
      return { alert, action: inserted.rowCount === 1 && alert ? "OPENED" : "UNCHANGED" };
    }

    if (open && shouldCloseAlert(state, "OPEN")) {
      await this.pool.query(
        `UPDATE supply_alerts SET status = 'CLOSED', closed_at = NOW()
          WHERE id = $1 AND status = 'OPEN'`,
        [open.id],
      );
      return { alert: null, action: "CLOSED" };
    }
    return { alert: open, action: "UNCHANGED" };
  }

  /** Concilia todas las alertas abiertas y los artículos bajo umbral (pasada del worker). */
  async syncAll(): Promise<{ opened: number; closed: number }> {
    const candidates = await this.pool.query(
      `SELECT DISTINCT i.id FROM supply_items i
        WHERE i.threshold_qty > 0
           OR EXISTS (SELECT 1 FROM supply_alerts a WHERE a.supply_item_id = i.id AND a.status = 'OPEN')`,
    );
    let opened = 0;
    let closed = 0;
    for (const row of candidates.rows) {
      const result = await this.syncForItem(row.id as string);
      if (result.action === "OPENED") opened += 1;
      if (result.action === "CLOSED") closed += 1;
    }
    return { opened, closed };
  }

  /** Alertas abiertas cuyo recordatorio diario toca ya (o nunca se recordó). */
  async dueReminders(intervalHours = 24, now: Date = new Date()): Promise<SupplyAlertWithItem[]> {
    const res = await this.pool.query(
      `${ALERT_WITH_ITEM_SELECT}
        WHERE a.status = 'OPEN'
          AND (a.last_reminded_at IS NULL OR a.last_reminded_at <= $1::timestamptz - ($2 || ' hours')::interval)
        ORDER BY a.opened_at ASC`,
      [now, intervalHours],
    );
    return res.rows.map(mapAlertWithItem);
  }

  /** Marca el recordatorio como enviado; devuelve cuántas alertas se actualizaron. */
  async markReminded(alertIds: readonly string[], now: Date = new Date()): Promise<number> {
    if (alertIds.length === 0) return 0;
    const res = await this.pool.query(
      `UPDATE supply_alerts SET last_reminded_at = $2 WHERE id = ANY($1::uuid[]) AND status = 'OPEN'`,
      [alertIds, now],
    );
    return res.rowCount ?? 0;
  }
}
