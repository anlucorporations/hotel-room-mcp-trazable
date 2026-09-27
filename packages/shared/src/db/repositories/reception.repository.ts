import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import type { RoomTypeDb } from "../../domain/room-master";
import { recoveryCodeForToken } from "../../reception/recovery-code";
import { ReceptionError } from "../../reception/errors";
import type {
  CheckoutIncidentKind,
  CheckoutRoomCondition,
} from "../../reception/checkout-vocabulary";

/**
 * Persistencia del MVP de recepción (incremento v2, D-31/D-33/D-34).
 *
 * Todo el estado operativo del mostrador vive **off-chain en PostgreSQL**: reservas del día (índice
 * `nfts`), cargos adicionales, check-outs e incidencias. El contrato canónico NO cambia: la cadena
 * solo conoce el check-in (`markCheckedIn`), no la salida ni los cargos del hotel.
 *
 * Nada de lo que se guarda aquí es un dato personal del huésped (RNF-30): el titular es su wallet
 * (pseudónima) y los cargos son conceptos e importes.
 */

/** Estado de la habitación derivable del índice para una fecha. */
export type ReservationStatus = "AVAILABLE" | "CONFIRMING" | "SOLD" | "BURNED" | "CHECKED_IN" | "CHECKED_OUT";

export interface DayReservation {
  readonly tokenId: string;
  readonly roomNumber: number;
  readonly roomType: RoomTypeDb;
  readonly checkInDate: string;
  readonly status: ReservationStatus;
  readonly currentOwner: string;
  readonly recoveryCode: string | null;
  readonly checkedInAt: Date | null;
}

export type ChargeStatus = "PENDING" | "CANCELLED" | "PAID";

export interface AdditionalCharge {
  readonly id: string;
  readonly tokenId: string;
  readonly concept: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: ChargeStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly cancelledBy: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
}

export interface CheckoutIncident {
  readonly id: string;
  readonly kind: CheckoutIncidentKind;
  readonly description: string | null;
}

export interface StayCheckout {
  readonly id: string;
  readonly tokenId: string;
  readonly roomNumber: number;
  readonly checkInDate: string;
  readonly roomCondition: CheckoutRoomCondition;
  readonly notes: string | null;
  readonly chargesCancelled: number;
  readonly processedBy: string;
  readonly createdAt: Date;
  readonly incidents: readonly CheckoutIncident[];
}

export interface CreateChargeInput {
  readonly tokenId: string;
  readonly concept: string;
  readonly amountCents: number;
  readonly createdBy: string;
  readonly currency?: string;
}

export interface CreateCheckoutInput {
  readonly tokenId: string;
  readonly roomCondition: CheckoutRoomCondition;
  readonly notes?: string | null;
  readonly incidents: readonly { kind: CheckoutIncidentKind; description?: string | null }[];
  /** Ids de cargos PENDING que se cancelan al cerrar la estancia. */
  readonly cancelChargeIds: readonly string[];
  readonly processedBy: string;
}

function mapReservation(row: QueryResultRow): DayReservation {
  return {
    tokenId: row.token_id,
    roomNumber: row.room_number,
    roomType: row.room_type,
    checkInDate:
      row.check_in_date instanceof Date
        ? row.check_in_date.toISOString().slice(0, 10)
        : String(row.check_in_date),
    status: row.status,
    currentOwner: row.current_owner,
    recoveryCode: row.recovery_code ?? null,
    checkedInAt: row.checked_in_at ?? null,
  };
}

function mapCharge(row: QueryResultRow): AdditionalCharge {
  return {
    id: row.id,
    tokenId: row.token_id,
    concept: row.concept,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    cancelledBy: row.cancelled_by ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelReason: row.cancel_reason ?? null,
  };
}

export class ReceptionRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /** Reservas de una fecha: noches vendidas (o ya con entrada/salida), ordenadas por habitación. */
  async listReservationsByDate(date: string): Promise<DayReservation[]> {
    const res = await this.pool.query(
      `SELECT token_id, room_number, room_type, check_in_date, status, current_owner,
              recovery_code, checked_in_at
         FROM nfts
        WHERE check_in_date = $1
          AND status IN ('SOLD', 'CHECKED_IN', 'CHECKED_OUT')
        ORDER BY room_number ASC`,
      [date],
    );
    return res.rows.map(mapReservation);
  }

  /** Histórico de la habitación en una fecha (para el estado del día, sin importar el estado). */
  async listNightsByDate(date: string): Promise<DayReservation[]> {
    const res = await this.pool.query(
      `SELECT token_id, room_number, room_type, check_in_date, status, current_owner,
              recovery_code, checked_in_at
         FROM nfts
        WHERE check_in_date = $1
        ORDER BY room_number ASC`,
      [date],
    );
    return res.rows.map(mapReservation);
  }

  /** Localiza la reserva por su código de recuperación (D-32). */
  async findByRecoveryCode(code: string): Promise<DayReservation | null> {
    const res = await this.pool.query(
      `SELECT token_id, room_number, room_type, check_in_date, status, current_owner,
              recovery_code, checked_in_at
         FROM nfts
        WHERE recovery_code = $1`,
      [code],
    );
    if (res.rows.length === 0) return null;
    return mapReservation(res.rows[0]);
  }

  /**
   * Rellena `recovery_code` en las filas que aún no lo tienen (bases anteriores al incremento).
   * Es idempotente y acotado: solo mira las filas vendidas/en estancia, no todo el histórico.
   * Devuelve cuántas filas actualizó.
   */
  async ensureRecoveryCodes(): Promise<number> {
    const res = await this.pool.query(
      `SELECT token_id FROM nfts
        WHERE recovery_code IS NULL
          AND status IN ('SOLD', 'CHECKED_IN', 'CHECKED_OUT')`,
    );
    let updated = 0;
    for (const row of res.rows) {
      const code = recoveryCodeForToken(row.token_id);
      const result = await this.pool.query(
        `UPDATE nfts SET recovery_code = $2 WHERE token_id = $1 AND recovery_code IS NULL`,
        [row.token_id, code],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  /** Alta de un cargo adicional (D-34). Recepción lo crea; el check-out lo cancela. */
  async createCharge(input: CreateChargeInput): Promise<AdditionalCharge> {
    const concept = input.concept.trim();
    if (concept.length === 0 || concept.length > 120) {
      throw new ReceptionError("CARGO_INVALIDO", "El concepto es obligatorio (máx. 120 caracteres).");
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new ReceptionError("CARGO_INVALIDO", "El importe debe ser un entero positivo en céntimos.");
    }

    const nft = await this.pool.query("SELECT token_id FROM nfts WHERE token_id = $1", [input.tokenId]);
    if (nft.rowCount === 0) {
      throw new ReceptionError("TOKEN_NO_ENCONTRADO", "La reserva no existe.");
    }

    const res = await this.pool.query(
      `INSERT INTO additional_charges (token_id, concept, amount_cents, currency, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.tokenId, concept, input.amountCents, input.currency ?? "EUR", input.createdBy],
    );
    return mapCharge(res.rows[0]);
  }

  /** Cargos de una estancia, más recientes primero. */
  async listCharges(tokenId: string): Promise<AdditionalCharge[]> {
    const res = await this.pool.query(
      `SELECT * FROM additional_charges WHERE token_id = $1 ORDER BY created_at DESC`,
      [tokenId],
    );
    return res.rows.map(mapCharge);
  }

  /**
   * Cancela los cargos indicados que sigan PENDING. Los ya cancelados o inexistentes se ignoran
   * (idempotente). Devuelve cuántos quedaron cancelados.
   */
  async cancelCharges(
    tokenId: string,
    ids: readonly string[],
    cancelledBy: string,
    reason?: string | null,
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.pool.query(
      `UPDATE additional_charges
          SET status = 'CANCELLED', cancelled_by = $3, cancelled_at = NOW(), cancel_reason = $4
        WHERE token_id = $1 AND id = ANY($2::uuid[]) AND status = 'PENDING'
        RETURNING id`,
      [tokenId, ids, cancelledBy, reason?.trim() || null],
    );
    return res.rowCount ?? 0;
  }

  async findCheckoutByToken(tokenId: string): Promise<StayCheckout | null> {
    const res = await this.pool.query(`SELECT * FROM stay_checkouts WHERE token_id = $1`, [tokenId]);
    if (res.rowCount === 0) return null;
    return this.hydrateCheckout(this.pool, res.rows[0]);
  }

  /**
   * Registra el check-out de una estancia (D-33, RF-34/RF-34.1).
   *
   * Transacción con bloqueo de fila (`FOR UPDATE`) para que dos puestos simultáneos no dupliquen
   * nada. Idempotente: si ya existe un check-out para el token, devuelve el existente con
   * `created = false` sin tocar nada más. Solo una noche con `CHECKED_IN` puede cerrarse.
   */
  async createCheckout(
    input: CreateCheckoutInput,
  ): Promise<{ checkout: StayCheckout; created: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const nft = await client.query(
        `SELECT token_id, room_number, check_in_date, status
           FROM nfts WHERE token_id = $1 FOR UPDATE`,
        [input.tokenId],
      );
      if (nft.rowCount === 0) {
        throw new ReceptionError("TOKEN_NO_ENCONTRADO", "La reserva no existe.");
      }

      const existing = await client.query(`SELECT * FROM stay_checkouts WHERE token_id = $1`, [
        input.tokenId,
      ]);
      if ((existing.rowCount ?? 0) > 0) {
        const checkout = await this.hydrateCheckout(client, existing.rows[0]);
        await client.query("COMMIT");
        return { checkout, created: false };
      }

      if (nft.rows[0].status !== "CHECKED_IN") {
        throw new ReceptionError(
          "ESTANCIA_NO_CHECKED_IN",
          "Solo puede hacerse el check-out de una estancia con la entrada ya registrada.",
        );
      }

      const inserted = await client.query(
        `INSERT INTO stay_checkouts
           (token_id, room_number, check_in_date, room_condition, notes, processed_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.tokenId,
          nft.rows[0].room_number,
          nft.rows[0].check_in_date,
          input.roomCondition,
          input.notes?.trim() || null,
          input.processedBy,
        ],
      );
      const checkoutRow = inserted.rows[0];

      for (const incident of input.incidents) {
        await client.query(
          `INSERT INTO checkout_incidents (checkout_id, kind, description) VALUES ($1, $2, $3)`,
          [checkoutRow.id, incident.kind, incident.description?.trim() || null],
        );
      }

      const cancelled = await client.query(
        `UPDATE additional_charges
            SET status = 'CANCELLED', cancelled_by = $3, cancelled_at = NOW(),
                cancel_reason = COALESCE(cancel_reason, 'Cancelado en el check-out')
          WHERE token_id = $1 AND id = ANY($2::uuid[]) AND status = 'PENDING'
          RETURNING id`,
        [input.tokenId, input.cancelChargeIds, input.processedBy],
      );
      const chargesCancelled = cancelled.rowCount ?? 0;

      await client.query(
        `UPDATE stay_checkouts SET charges_cancelled = $2 WHERE id = $1`,
        [checkoutRow.id, chargesCancelled],
      );
      await client.query(`UPDATE nfts SET status = 'CHECKED_OUT' WHERE token_id = $1`, [
        input.tokenId,
      ]);

      // D-19: al hacer el check-out la habitación pasa a DIRTY y entra en el reparto de limpieza.
      // Se deja traza en `housekeeping_room_logs` con el valor anterior real (F3 · D-48/D-62).
      const room = await client.query(
        `SELECT id, operational_status FROM rooms
          WHERE room_number = $1 AND archived_at IS NULL FOR UPDATE`,
        [nft.rows[0].room_number],
      );
      if ((room.rowCount ?? 0) > 0) {
        const fromStatus = room.rows[0].operational_status as string;
        await client.query(
          `UPDATE rooms SET operational_status = 'DIRTY', updated_at = NOW() WHERE id = $1`,
          [room.rows[0].id],
        );
        if (fromStatus !== "DIRTY") {
          await client.query(
            `INSERT INTO housekeeping_room_logs (room_id, from_value, to_value, changed_by)
             VALUES ($1, $2, 'DIRTY', $3)`,
            [room.rows[0].id, fromStatus, input.processedBy],
          );
        }
      }

      const checkout = await this.hydrateCheckout(client, {
        ...checkoutRow,
        charges_cancelled: chargesCancelled,
      });
      await client.query("COMMIT");
      return { checkout, created: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Carga las incidencias de un check-out ya leído. */
  private async hydrateCheckout(
    executor: Pool | PoolClient,
    row: QueryResultRow,
  ): Promise<StayCheckout> {
    const incidents = await executor.query(
      `SELECT id, kind, description FROM checkout_incidents WHERE checkout_id = $1 ORDER BY created_at ASC`,
      [row.id],
    );
    return {
      id: row.id,
      tokenId: row.token_id,
      roomNumber: row.room_number,
      checkInDate:
        row.check_in_date instanceof Date
          ? row.check_in_date.toISOString().slice(0, 10)
          : String(row.check_in_date),
      roomCondition: row.room_condition,
      notes: row.notes ?? null,
      chargesCancelled: Number(row.charges_cancelled ?? 0),
      processedBy: row.processed_by,
      createdAt: row.created_at,
      incidents: incidents.rows.map((incident) => ({
        id: incident.id,
        kind: incident.kind,
        description: incident.description ?? null,
      })),
    };
  }
}
