import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import { AuditRepository } from "./audit.repository";
import {
  DAMAGE_CLAIM_WINDOW_HOURS,
  DAMAGE_EVIDENCE_RETENTION_DAYS,
  acknowledgeStatus,
  claimStatus,
  defaultClaimDueDate,
  resolutionForDecision,
  type DamageNotificationChannel,
  type DamageNotificationStatus,
} from "../../domain/damage-charges";

/**
 * Repositorio de **cargos por daños y notificaciones al huésped** (F7 · T7.1/T7.5/T7.6).
 *
 * Invariantes:
 *   - El cargo por daños **no crea firmas on-chain** (D-C27): `signature_id` queda `NULL` y la traza
 *     va a `operator_audit_log` (encadenada).
 *   - El alta es **transaccional**: cargo adicional + detalle de daños + notificación nacen juntos.
 *   - Las transiciones de estado se hacen con `UPDATE … WHERE status = …` (compare-and-set) para que
 *     dos peticiones simultáneas no pisen una reclamación ya resuelta.
 *   - La retención de evidencias anonimiza ruta y notas pasados 90 días sin borrar la traza.
 */

export interface DamageChargeRecord {
  readonly id: string;
  readonly chargeId: string;
  readonly roomId: string;
  readonly tokenId: string | null;
  readonly inspectionId: string | null;
  readonly reportedBy: string;
  readonly damageDescription: string;
  readonly evidencePath: string | null;
  readonly approvedBy: string;
  /** D-C27: siempre `null`; se expone para poder afirmarlo en pruebas/UI. */
  readonly signatureId: string | null;
  readonly auditLogId: string | null;
  readonly createdAt: Date;
}

export interface DamageNotificationRecord {
  readonly id: string;
  readonly damageChargeId: string;
  readonly channel: DamageNotificationChannel;
  readonly status: DamageNotificationStatus;
  readonly dueDate: Date;
  readonly sentAt: Date | null;
  readonly disputeNotes: string | null;
  readonly disputedAt: Date | null;
  readonly resolvedBy: string | null;
  readonly resolvedAt: Date | null;
}

/** Notificación con los datos del cargo y de la habitación/noche que necesita el portal del huésped. */
export interface DamageNotificationView extends DamageNotificationRecord {
  readonly chargeId: string;
  readonly roomId: string;
  readonly roomNumber: number | null;
  readonly tokenId: string | null;
  readonly concept: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly chargeStatus: "PENDING" | "CANCELLED" | "PAID";
  readonly damageDescription: string;
  readonly evidencePath: string | null;
  readonly reportedBy: string;
  readonly createdAt: Date;
}

export interface CreateDamageChargeInput {
  readonly roomId: string;
  /** Token de la noche vendida a la que se vincula el cargo (D-C4, obligatorio). */
  readonly tokenId: string;
  readonly inspectionId?: string | null;
  readonly reportedBy: string;
  readonly approvedBy: string;
  readonly actorRole: string;
  readonly damageDescription: string;
  readonly amountCents: number;
  readonly concept?: string;
  readonly currency?: string;
  readonly evidencePath?: string | null;
  readonly channel?: DamageNotificationChannel;
  readonly claimWindowHours?: number;
}

export type DamageChargeErrorCode =
  | "CHARGE_NOT_FOUND"
  | "NOTIFICATION_NOT_FOUND"
  | "NOTIFICATION_NOT_CLAIMABLE"
  | "NOTIFICATION_NOT_DISPUTED"
  | "NOTIFICATION_ALREADY_RESOLVED";

export class DamageChargeError extends Error {
  constructor(
    readonly code: DamageChargeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DamageChargeError";
  }
}

const VIEW_SELECT = `SELECT n.*, c.charge_id, c.room_id, c.token_id, c.damage_description, c.evidence_path,
          c.reported_by, c.created_at,
          ch.concept, ch.amount_cents, ch.currency, ch.status AS charge_status,
          r.room_number
     FROM damage_charge_guest_notifications n
     JOIN housekeeping_damage_charges c ON c.id = n.damage_charge_id
     JOIN additional_charges ch ON ch.id = c.charge_id
     LEFT JOIN rooms r ON r.id = c.room_id`;

export class DamageChargesRepository {
  constructor(
    private readonly pool: Pool = getDbPool(),
    /** Auditoría inyectable (las pruebas no encadenan hashes reales). */
    private readonly audit: Pick<AuditRepository, "append"> = new AuditRepository(),
  ) {}

  /**
   * Alta atómica: cargo adicional (`PENDING`) + detalle del daño (`signature_id = NULL`) + notificación
   * (`PENDING`, plazo de reclamación). Después escribe la traza de auditoría y la enlaza.
   */
  async createChargeWithNotification(input: CreateDamageChargeInput): Promise<{
    damageCharge: DamageChargeRecord;
    notification: DamageNotificationRecord;
  }> {
    const client = await this.pool.connect();
    let chargeId = "";
    let damageChargeId = "";
    try {
      await client.query("BEGIN");
      const charge = await client.query(
        `INSERT INTO additional_charges (token_id, concept, amount_cents, currency, status, created_by)
         VALUES ($1, $2, $3, $4, 'PENDING', $5)
         RETURNING id`,
        [
          input.tokenId,
          (input.concept ?? "Daños en la habitación").slice(0, 120),
          input.amountCents,
          input.currency ?? "EUR",
          input.reportedBy,
        ],
      );
      chargeId = charge.rows[0].id as string;

      const damage = await client.query(
        `INSERT INTO housekeeping_damage_charges
           (charge_id, room_id, token_id, inspection_id, reported_by, damage_description,
            evidence_path, approved_by, signature_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
         RETURNING *`,
        [
          chargeId,
          input.roomId,
          input.tokenId ?? null,
          input.inspectionId ?? null,
          input.reportedBy,
          input.damageDescription,
          input.evidencePath ?? null,
          input.approvedBy,
        ],
      );
      damageChargeId = damage.rows[0].id as string;

      const dueDate = defaultClaimDueDate(new Date(), input.claimWindowHours ?? DAMAGE_CLAIM_WINDOW_HOURS);
      const notification = await client.query(
        `INSERT INTO damage_charge_guest_notifications (damage_charge_id, channel, due_date, status)
         VALUES ($1, $2, $3, 'PENDING')
         RETURNING *`,
        [damageChargeId, input.channel ?? "EMAIL", dueDate],
      );
      await client.query("COMMIT");

      // Traza encadenada (best-effort: la auditoría no debe tumbar el alta si su cerrojo falla,
      // pero se registra el fallo para poder accionar).
      let auditLogId: string | null = null;
      try {
        const entry = await this.audit.append({
          actorUsername: input.reportedBy,
          actorRole: input.actorRole,
          entityType: "DAMAGE_CHARGE",
          entityId: damageChargeId,
          action: "CREATE",
          newValue: {
            chargeId,
            roomId: input.roomId,
            tokenId: input.tokenId ?? null,
            amountCents: input.amountCents,
            signatureId: null,
          },
        });
        auditLogId = entry.id;
        await this.pool.query(`UPDATE housekeeping_damage_charges SET audit_log_id = $2 WHERE id = $1`, [
          damageChargeId,
          auditLogId,
        ]);
      } catch (error: unknown) {
        console.warn("[damage-charges] no se pudo registrar la auditoría del cargo:", error);
      }

      return {
        damageCharge: mapDamageCharge({ ...damage.rows[0], audit_log_id: auditLogId }),
        notification: mapNotification(notification.rows[0]),
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Notificación con el cargo y la habitación (portal del huésped y recepción). */
  async findNotification(id: string): Promise<DamageNotificationView | null> {
    const res = await this.pool.query(`${VIEW_SELECT} WHERE n.id = $1`, [id]);
    return res.rows.length > 0 ? mapView(res.rows[0]) : null;
  }

  /** Notificaciones filtradas (recepción) o de una noche (portal del huésped). */
  async listNotifications(
    filter: {
      tokenId?: string;
      statuses?: readonly DamageNotificationStatus[];
      limit?: number;
    } = {},
  ): Promise<DamageNotificationView[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.tokenId) {
      values.push(filter.tokenId);
      where.push(`c.token_id = $${values.length}`);
    }
    if (filter.statuses && filter.statuses.length > 0) {
      values.push(filter.statuses);
      where.push(`n.status = ANY($${values.length}::text[])`);
    }
    const limit = Math.min(200, Math.max(1, filter.limit ?? 100));
    values.push(limit);
    const res = await this.pool.query(
      `${VIEW_SELECT}${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""}
        ORDER BY n.due_date ASC, n.id ASC LIMIT $${values.length}`,
      values,
    );
    return res.rows.map(mapView);
  }

  /** Marca `SENT` (la notificación salió por su canal). Idempotente. */
  async markSent(id: string): Promise<DamageNotificationView | null> {
    const res = await this.pool.query(
      `UPDATE damage_charge_guest_notifications
          SET status = 'SENT', sent_at = COALESCE(sent_at, NOW())
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *`,
      [id],
    );
    if (res.rows.length === 0) return this.findNotification(id);
    return this.findNotification(id);
  }

  /** Reclamación del huésped (DISPUTED) solo dentro de plazo; si no, `NOTIFICATION_NOT_CLAIMABLE`. */
  async claimNotification(
    id: string,
    notes: string | null,
    now: Date = new Date(),
  ): Promise<DamageNotificationView> {
    const current = await this.findNotification(id);
    if (!current) throw new DamageChargeError("NOTIFICATION_NOT_FOUND", "La notificación no existe.");
    const next = claimStatus(current.status, current.dueDate, now);
    if (next === null) {
      throw new DamageChargeError(
        "NOTIFICATION_NOT_CLAIMABLE",
        `No se puede reclamar una notificación ${current.status} o fuera de plazo.`,
      );
    }
    const res = await this.pool.query(
      `UPDATE damage_charge_guest_notifications
          SET status = $2, dispute_notes = $3, disputed_at = NOW()
        WHERE id = $1 AND status = ANY($4::text[])
        RETURNING id`,
      [id, next, notes, ["PENDING", "SENT"]],
    );
    if (res.rows.length === 0) {
      throw new DamageChargeError("NOTIFICATION_NOT_CLAIMABLE", "La notificación ya no admite reclamación.");
    }
    return (await this.findNotification(id))!;
  }

  /** Huésped conforme sin reclamación (ACKNOWLEDGED). */
  async acknowledgeNotification(id: string, now: Date = new Date()): Promise<DamageNotificationView> {
    const current = await this.findNotification(id);
    if (!current) throw new DamageChargeError("NOTIFICATION_NOT_FOUND", "La notificación no existe.");
    const next = acknowledgeStatus(current.status, current.dueDate, now);
    if (next === null) {
      throw new DamageChargeError(
        "NOTIFICATION_NOT_CLAIMABLE",
        `No se puede aceptar una notificación ${current.status} o fuera de plazo.`,
      );
    }
    const res = await this.pool.query(
      `UPDATE damage_charge_guest_notifications
          SET status = $2
        WHERE id = $1 AND status IN ('PENDING', 'SENT')
        RETURNING id`,
      [id, next],
    );
    if (res.rows.length === 0) {
      throw new DamageChargeError("NOTIFICATION_NOT_CLAIMABLE", "La notificación ya no admite aceptación.");
    }
    return (await this.findNotification(id))!;
  }

  /** Marca EXPIRED las notificaciones emitidas con plazo vencido. Devuelve cuántas cambió. */
  async expireOverdueNotifications(now: Date = new Date()): Promise<number> {
    const res = await this.pool.query(
      `UPDATE damage_charge_guest_notifications
          SET status = 'EXPIRED'
        WHERE status IN ('PENDING', 'SENT') AND due_date < $1`,
      [now],
    );
    return res.rowCount ?? 0;
  }

  /**
   * Resolución de recepción (T7.5): aceptar mantiene el cargo para el folio; rechazar lo cancela.
   * Solo se resuelve una reclamación (`DISPUTED`) o, si el hotel lo decide, una `EXPIRED`.
   */
  async resolveNotification(input: {
    id: string;
    accepted: boolean;
    resolvedBy: string;
    now?: Date;
  }): Promise<{ notification: DamageNotificationView; chargeStatus: "PENDING" | "CANCELLED" }> {
    const current = await this.findNotification(input.id);
    if (!current) throw new DamageChargeError("NOTIFICATION_NOT_FOUND", "La notificación no existe.");
    if (current.status === "RESOLVED_ACCEPTED" || current.status === "RESOLVED_REJECTED") {
      throw new DamageChargeError("NOTIFICATION_ALREADY_RESOLVED", "La reclamación ya estaba resuelta.");
    }
    if (current.status !== "DISPUTED" && current.status !== "EXPIRED") {
      throw new DamageChargeError(
        "NOTIFICATION_NOT_DISPUTED",
        `Solo se resuelven reclamaciones o avisos vencidos (estado actual: ${current.status}).`,
      );
    }
    const resolution = resolutionForDecision(input.accepted);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const notification = await client.query(
        `UPDATE damage_charge_guest_notifications
            SET status = $2, resolved_by = $3, resolved_at = NOW()
          WHERE id = $1 AND status = ANY($4::text[])
          RETURNING id`,
        [input.id, resolution.notificationStatus, input.resolvedBy, ["DISPUTED", "EXPIRED"]],
      );
      if (notification.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new DamageChargeError("NOTIFICATION_ALREADY_RESOLVED", "La reclamación ya estaba resuelta.");
      }
      await client.query(
        `UPDATE additional_charges
            SET status = $2,
                cancelled_by = CASE WHEN $2 = 'CANCELLED' THEN $3 ELSE cancelled_by END,
                cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN NOW() ELSE cancelled_at END,
                cancel_reason = CASE WHEN $2 = 'CANCELLED' THEN 'Reclamación rechazada en recepción' ELSE cancel_reason END
          WHERE id = $1 AND status = 'PENDING'`,
        [current.chargeId, resolution.chargeStatus, input.resolvedBy],
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { notification: (await this.findNotification(input.id))!, chargeStatus: resolution.chargeStatus };
  }

  /**
   * Check-out (T7.5): los cargos con reclamación **aceptada** pasan a `PAID` y se devuelven para el
   * folio. Idempotente por el `WHERE status = 'PENDING'`.
   */
  async settleAcceptedChargesForToken(
    tokenId: string,
    actor: string,
  ): Promise<Array<{ chargeId: string; concept: string; amountCents: number; currency: string }>> {
    const res = await this.pool.query(
      `UPDATE additional_charges ch
          SET status = 'PAID'
         FROM housekeeping_damage_charges c
         JOIN damage_charge_guest_notifications n ON n.damage_charge_id = c.id
        WHERE ch.id = c.charge_id
          AND c.token_id = $1
          AND n.status = 'RESOLVED_ACCEPTED'
          AND ch.status = 'PENDING'
        RETURNING ch.id, ch.concept, ch.amount_cents, ch.currency`,
      [tokenId],
    );
    if (res.rows.length > 0) {
      try {
        await this.audit.append({
          actorUsername: actor,
          actorRole: "RECEPTION_ROLE",
          entityType: "DAMAGE_CHARGE_SETTLEMENT",
          entityId: null,
          action: "SETTLE_CHECKOUT",
          newValue: { tokenId, charges: res.rows.map((row) => row.id) },
        });
      } catch (error: unknown) {
        console.warn("[damage-charges] auditoría del cobro en check-out no registrada:", error);
      }
    }
    return res.rows.map((row) => ({
      chargeId: row.id as string,
      concept: row.concept as string,
      amountCents: Number(row.amount_cents),
      currency: row.currency as string,
    }));
  }

  /**
   * Retención GDPR (T7.6): anonimiza ruta de evidencia y notas de disputa de los cargos más antiguos
   * que la retención, sin borrar la traza contable. Devuelve cuántos cargos se anonimizaron.
   */
  async anonymizeExpiredEvidence(
    retentionDays = DAMAGE_EVIDENCE_RETENTION_DAYS,
    now: Date = new Date(),
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const res = await this.pool.query(
      `UPDATE housekeeping_damage_charges c
          SET evidence_path = NULL
         FROM damage_charge_guest_notifications n
        WHERE n.damage_charge_id = c.id
          AND c.created_at < $1
          AND (c.evidence_path IS NOT NULL OR n.dispute_notes IS NOT NULL)`,
      [cutoff],
    );
    if ((res.rowCount ?? 0) > 0) {
      await this.pool.query(
        `UPDATE damage_charge_guest_notifications n
            SET dispute_notes = NULL
           FROM housekeeping_damage_charges c
          WHERE n.damage_charge_id = c.id
            AND c.created_at < $1
            AND n.dispute_notes IS NOT NULL
            AND n.status IN ('RESOLVED_ACCEPTED', 'RESOLVED_REJECTED', 'ACKNOWLEDGED', 'EXPIRED')`,
        [cutoff],
      );
    }
    return res.rowCount ?? 0;
  }
}

function mapDamageCharge(row: QueryResultRow): DamageChargeRecord {
  return {
    id: row.id as string,
    chargeId: row.charge_id as string,
    roomId: row.room_id as string,
    tokenId: (row.token_id as string | null) ?? null,
    inspectionId: (row.inspection_id as string | null) ?? null,
    reportedBy: row.reported_by as string,
    damageDescription: row.damage_description as string,
    evidencePath: (row.evidence_path as string | null) ?? null,
    approvedBy: row.approved_by as string,
    signatureId: (row.signature_id as string | null) ?? null,
    auditLogId: (row.audit_log_id as string | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

function mapNotification(row: QueryResultRow): DamageNotificationRecord {
  return {
    id: row.id as string,
    damageChargeId: row.damage_charge_id as string,
    channel: row.channel as DamageNotificationChannel,
    status: row.status as DamageNotificationStatus,
    dueDate: row.due_date as Date,
    sentAt: (row.sent_at as Date | null) ?? null,
    disputeNotes: (row.dispute_notes as string | null) ?? null,
    disputedAt: (row.disputed_at as Date | null) ?? null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    resolvedAt: (row.resolved_at as Date | null) ?? null,
  };
}

function mapView(row: QueryResultRow): DamageNotificationView {
  return {
    ...mapNotification(row),
    chargeId: row.charge_id as string,
    roomId: row.room_id as string,
    roomNumber: row.room_number === null || row.room_number === undefined ? null : Number(row.room_number),
    tokenId: (row.token_id as string | null) ?? null,
    concept: row.concept as string,
    amountCents: Number(row.amount_cents),
    currency: row.currency as string,
    chargeStatus: row.charge_status as "PENDING" | "CANCELLED" | "PAID",
    damageDescription: row.damage_description as string,
    evidencePath: (row.evidence_path as string | null) ?? null,
    reportedBy: row.reported_by as string,
    createdAt: row.created_at as Date,
  };
}

export type { PoolClient };
