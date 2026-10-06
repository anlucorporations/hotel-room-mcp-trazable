import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";
import { decryptWithKey, encryptWithKey } from "../../auth/crypto";

/**
 * Motor de reservas (F2 · D-34…D-43, D-55, D-57, D-60).
 *
 * Una **reserva retiene** noches sin acuñar (D-35); el token se emite al pagar el 100 % (D-39) y la
 * disponibilidad es **exacta** (D-41): no se puede sobrevender. La garantía dura la impone la base de
 * datos con el índice único parcial `(room_id, night_date) WHERE active` (D-41); aquí se comprueba
 * además el choque con tokens ya vendidos (D-57).
 *
 * El contacto del huésped es **mínimo, cifrado y purgable** (D-55): solo canal + dirección, cifrada
 * con AES-256-GCM, nunca nombre, DNI ni teléfono.
 */

export type ReservationChannel = "WEB" | "COUNTER";
export type ReservationBookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
export type ReservationContactChannel = "EMAIL" | "TELEGRAM" | "WEB";
export type FolioStatus = "OPEN" | "CLOSED";

/** Estado de disponibilidad de una noche concreta. */
export type NightAvailability = "FREE" | "RESERVED" | "SOLD";

export interface ReservationRecord {
  id: string;
  roomId: string;
  roomNumber: number;
  checkInDate: string;
  checkOutDate: string;
  channel: ReservationChannel;
  status: ReservationBookingStatus;
  totalCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
  holdExpiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface ReservationNightRecord {
  id: string;
  reservationId: string;
  roomId: string;
  nightDate: string;
  tokenId: string | null;
  active: boolean;
}

export interface FolioRecord {
  id: string;
  reservationId: string;
  status: FolioStatus;
  openedAt: Date;
  closedAt: Date | null;
  totalCents: number;
}

export interface ReservationContactInfo {
  channel: ReservationContactChannel;
  value: string;
}

/** Plan de liquidación al 100 % (D-57): qué noche se asigna a un token, cuál hay que acuñar. */
export interface SettlementPlan {
  reservationId: string;
  assigned: Array<{ nightDate: string; tokenId: string }>;
  needsMint: string[];
  conflicts: string[];
}

export interface CreateReservationInput {
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  channel: ReservationChannel;
  createdBy: string;
  totalCents: number;
  depositRequiredCents?: number;
  contact?: ReservationContactInfo;
  /** Horas de bloqueo antes de liberar el inventario si no se paga (D-37; por defecto 24). */
  holdHours?: number;
  /** Ocupación de la reserva (RF-52). */
  adultCount?: number;
  childCount?: number;
  babyCount?: number;
  petCount?: number;
  accessibilityCount?: number;
}

export interface ModifyReservationInput {
  checkInDate?: string;
  checkOutDate?: string;
  roomId?: string;
  totalCents?: number;
}

export type ReservationErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_BLOCKED"
  | "UNAVAILABLE"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_DATES"
  | "CONTACT_REQUIRED";

/** Error de negocio reconocible por la API. */
export class ReservationError extends Error {
  constructor(
    readonly code: ReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

/** Horas de bloqueo por defecto (D-37: 24 h). */
export const DEFAULT_HOLD_HOURS = 24;
/** Anticipo por defecto (D-37: 30 %). */
export const DEFAULT_DEPOSIT_PERCENT = 30;
/** Hora límite de llegada por defecto (D-42: 18:00 UTC) tras la cual una confirmada es no-show. */
export const DEFAULT_NO_SHOW_HOUR = 18;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lista de noches `[checkIn, checkOut)` en formato AAAA-MM-DD. */
export function nightsBetween(checkInDate: string, checkOutDate: string): string[] {
  const start = Date.parse(`${checkInDate}T00:00:00Z`);
  const end = Date.parse(`${checkOutDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    throw new ReservationError("INVALID_DATES", "La fecha de salida debe ser posterior a la de entrada.");
  }
  const nights: string[] = [];
  for (let t = start; t < end; t += DAY_MS) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
}

export class ReservationsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Disponibilidad noche a noche de una habitación (D-41/D-57).
   *
   * `SOLD` si ya hay un token vendido o consumido de esa noche; `RESERVED` si hay una reserva activa;
   * `FREE` en caso contrario. No lanza: la decisión la toma el llamante.
   */
  async checkAvailability(roomId: string, checkInDate: string, checkOutDate: string): Promise<Array<{ nightDate: string; status: NightAvailability }>> {
    const nights = nightsBetween(checkInDate, checkOutDate);
    if (nights.length === 0) return [];

    const reservations = await this.pool.query(
      `SELECT night_date::text AS night_date
         FROM reservation_nights
        WHERE room_id = $1 AND active = TRUE AND night_date = ANY($2::date[])`,
      [roomId, nights],
    );
    const reserved = new Set(reservations.rows.map((row) => row.night_date as string));

    const sold = await this.pool.query(
      `SELECT check_in_date::text AS night_date
         FROM nfts
        WHERE room_number = (SELECT room_number FROM rooms WHERE id = $1)
          AND status IN ('SOLD', 'CHECKED_IN', 'CHECKED_OUT')
          AND check_in_date = ANY($2::date[])`,
      [roomId, nights],
    );
    const soldSet = new Set(sold.rows.map((row) => row.night_date as string));

    return nights.map((nightDate) => ({
      nightDate,
      status: soldSet.has(nightDate) ? "SOLD" : reserved.has(nightDate) ? "RESERVED" : "FREE",
    }));
  }

  /** ¿La noche está retenida por una reserva activa? (D-57: el acuñado debe omitirla). */
  async isNightReserved(roomNumber: number, nightDate: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1
         FROM reservation_nights rn
         JOIN rooms r ON r.id = rn.room_id
        WHERE r.room_number = $1 AND rn.night_date = $2 AND rn.active = TRUE
        LIMIT 1`,
      [roomNumber, nightDate],
    );
    return res.rows.length > 0;
  }

  /** Lista las reservas, opcionalmente filtradas por estado y/o fecha de entrada. */
  async listReservations(filter: { status?: ReservationBookingStatus; checkInDate?: string } = {}): Promise<ReservationRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.status) {
      values.push(filter.status);
      conditions.push(`r.status = $${values.length}`);
    }
    if (filter.checkInDate) {
      values.push(filter.checkInDate);
      conditions.push(`r.check_in_date = $${values.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.pool.query(
      `SELECT r.*, rooms.room_number
         FROM reservations r
         JOIN rooms ON rooms.id = r.room_id
         ${where}
        ORDER BY r.check_in_date ASC, rooms.room_number ASC`,
      values,
    );
    return res.rows.map(mapReservation);
  }

  /** Llegadas del día: reservas cuya entrada es `date` y siguen vivas. */
  async listArrivals(date: string): Promise<ReservationRecord[]> {
    const res = await this.pool.query(
      `SELECT r.*, rooms.room_number
         FROM reservations r
         JOIN rooms ON rooms.id = r.room_id
        WHERE r.check_in_date = $1
          AND r.status IN ('PENDING', 'CONFIRMED')
        ORDER BY rooms.room_number ASC`,
      [date],
    );
    return res.rows.map(mapReservation);
  }

  async findById(id: string): Promise<{ reservation: ReservationRecord; nights: ReservationNightRecord[] } | null> {
    const res = await this.pool.query(
      `SELECT r.*, rooms.room_number
         FROM reservations r JOIN rooms ON rooms.id = r.room_id
        WHERE r.id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    const nights = await this.pool.query(
      `SELECT * FROM reservation_nights WHERE reservation_id = $1 ORDER BY night_date ASC`,
      [id],
    );
    return { reservation: mapReservation(res.rows[0]), nights: nights.rows.map(mapNight) };
  }

  /**
   * Crea la reserva **reteniendo** las noches (D-35): valida disponibilidad, guarda el contacto
   * cifrado (D-55), abre el folio (D-60) y deja el historial. Todo en una transacción.
   */
  async createReservation(input: CreateReservationInput): Promise<ReservationRecord> {
    const nights = nightsBetween(input.checkInDate, input.checkOutDate);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const room = await client.query("SELECT id, room_number FROM rooms WHERE id = $1 AND archived_at IS NULL", [
        input.roomId,
      ]);
      if (room.rows.length === 0) {
        throw new ReservationError("ROOM_NOT_FOUND", "La habitación no existe o está archivada.");
      }

      // D-53: una avería abierta que bloquea la venta impide reservar la habitación. El bloqueo lo
      // levanta el propio mantenimiento al resolver la incidencia, sin tocar la publicación (F4).
      const blocked = await client.query(
        `SELECT 1 FROM maintenance_incidents
          WHERE room_id = $1 AND blocks_sale = TRUE AND status IN ('OPEN', 'IN_PROGRESS')
          LIMIT 1`,
        [input.roomId],
      );
      if (blocked.rows.length > 0) {
        throw new ReservationError(
          "ROOM_BLOCKED",
          "La habitación está bloqueada por una avería en curso (D-53).",
        );
      }

      await this.assertNightsFree(client, input.roomId, nights);

      const holdHours = input.holdHours ?? DEFAULT_HOLD_HOURS;
      const depositRequired = input.depositRequiredCents ?? Math.round((input.totalCents * DEFAULT_DEPOSIT_PERCENT) / 100);

      const adultCount = Math.max(0, input.adultCount ?? 1);
      const childCount = Math.max(0, input.childCount ?? 0);
      const babyCount = Math.max(0, input.babyCount ?? 0);
      const petCount = Math.max(0, input.petCount ?? 0);
      const accessibilityCount = Math.max(0, input.accessibilityCount ?? 0);

      const inserted = await client.query(
        `INSERT INTO reservations
            (room_id, check_in_date, check_out_date, channel, status, total_cents,
             deposit_required_cents, deposit_paid_cents, hold_expires_at, created_by,
             adult_count, child_count, baby_count, pet_count, accessibility_count)
         VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, 0, NOW() + ($7 || ' hours')::INTERVAL, $8,
                 $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          input.roomId,
          input.checkInDate,
          input.checkOutDate,
          input.channel,
          input.totalCents,
          depositRequired,
          String(holdHours),
          input.createdBy,
          adultCount,
          childCount,
          babyCount,
          petCount,
          accessibilityCount,
        ],
      );
      const reservationId = inserted.rows[0].id as string;

      for (const nightDate of nights) {
        await client.query(
          `INSERT INTO reservation_nights (reservation_id, room_id, night_date, active) VALUES ($1, $2, $3, TRUE)`,
          [reservationId, input.roomId, nightDate],
        );
      }

      await client.query(`INSERT INTO folios (reservation_id, status, total_cents) VALUES ($1, 'OPEN', 0)`, [
        reservationId,
      ]);

      if (input.contact) {
        const valueEnc = encryptWithKey("AES_SECRET_KEY", input.contact.value);
        await client.query(
          `INSERT INTO reservation_contacts (reservation_id, channel, value_enc, purge_at)
           VALUES ($1, $2, $3, $4)`,
          [reservationId, input.contact.channel, valueEnc, input.checkOutDate],
        );
      }

      await client.query(
        `INSERT INTO reservation_status_history (reservation_id, from_value, to_value, changed_by, reason)
         VALUES ($1, NULL, 'PENDING', $2, 'Alta de reserva')`,
        [reservationId, input.createdBy],
      );

      await client.query("COMMIT");
      return mapReservation({ ...inserted.rows[0], room_number: room.rows[0].room_number });
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new ReservationError("UNAVAILABLE", "Alguna de las noches acaba de ser reservada por otra persona.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Confirma la reserva (pago del anticipo). No emite token: eso ocurre al 100 % (D-39). */
  async confirmReservation(id: string, actor: string): Promise<ReservationRecord | null> {
    return this.transition(id, "CONFIRMED", actor, undefined, "confirmed_at");
  }

  /** Cancela la reserva y **libera** el inventario (D-40). */
  async cancelReservation(id: string, actor: string, reason?: string): Promise<ReservationRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT status FROM reservations WHERE id = $1 AND status IN ('PENDING', 'CONFIRMED')`,
        [id],
      );
      if (previous.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const fromValue = previous.rows[0].status as ReservationBookingStatus;
      const updated = await client.query(
        `UPDATE reservations
            SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = $2, updated_at = NOW()
          WHERE id = $1 AND status IN ('PENDING', 'CONFIRMED')
          RETURNING *`,
        [id, reason ?? null],
      );
      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(`UPDATE reservation_nights SET active = FALSE WHERE reservation_id = $1`, [id]);
      await client.query(
        `INSERT INTO reservation_status_history (reservation_id, from_value, to_value, changed_by, reason)
         VALUES ($1, $2, 'CANCELLED', $3, $4)`,
        [id, fromValue, actor, reason ?? "Cancelación"],
      );
      await client.query("COMMIT");
      return mapReservation(updated.rows[0]);
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Marca el no-show (D-42) y libera el inventario. */
  async markNoShow(id: string, actor: string): Promise<ReservationRecord | null> {
    return this.cancelLike(id, "NO_SHOW", actor, "No-show");
  }

  /**
   * Marca como no-show las reservas **confirmadas** cuya llegada ya pasó (D-42), liberando su
   * inventario. La **hora límite es configurable** (`noShowHour`, D-42): una reserva de hoy solo es
   * no-show cuando la hora actual la supera; las de días anteriores lo son siempre. Lo invoca el
   * planificador de retención del worker. Devuelve cuántas marcó.
   */
  async markNoShows(now: Date = new Date(), noShowHour: number = DEFAULT_NO_SHOW_HOUR): Promise<number> {
    const date = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const rows = await this.pool.query(
      `SELECT id FROM reservations
        WHERE status = 'CONFIRMED'
          AND (check_in_date < $1::date OR (check_in_date = $1::date AND $2 >= $3))`,
      [date, hour, noShowHour],
    );
    let count = 0;
    for (const row of rows.rows) {
      const marked = await this.markNoShow(row.id as string, "sistema");
      if (marked) count += 1;
    }
    return count;
  }

  /**
   * Plan de liquidación al 100 % (D-57): para cada noche retenida, si ya existe un token **no
   * vendido** lo **asigna** a la reserva; si no existe, se anota que hay que **acuñarlo**; si el
   * token ya está vendido o consumido por otro, es un **conflicto**.
   *
   * No emite ninguna transacción: la compra/acuñado on-chain la firma la wallet (D-60).
   */
  async planSettlement(id: string): Promise<SettlementPlan | null> {
    const found = await this.findById(id);
    if (!found) return null;

    const assigned: Array<{ nightDate: string; tokenId: string }> = [];
    const needsMint: string[] = [];
    const conflicts: string[] = [];

    for (const night of found.nights.filter((item) => item.active)) {
      if (night.tokenId) {
        assigned.push({ nightDate: night.nightDate, tokenId: night.tokenId });
        continue;
      }
      const token = await this.pool.query(
        `SELECT token_id, status FROM nfts WHERE room_number = $1 AND check_in_date = $2 LIMIT 1`,
        [found.reservation.roomNumber, night.nightDate],
      );
      if (token.rows.length === 0) {
        needsMint.push(night.nightDate);
        continue;
      }
      const tokenId = token.rows[0].token_id as string;
      const status = token.rows[0].status as string;
      if (status === "AVAILABLE" || status === "CONFIRMING") {
        await this.assignToken(id, night.nightDate, tokenId);
        assigned.push({ nightDate: night.nightDate, tokenId });
      } else if (status === "SOLD" || status === "CHECKED_IN" || status === "CHECKED_OUT") {
        conflicts.push(night.nightDate);
      } else {
        needsMint.push(night.nightDate);
      }
    }

    return { reservationId: id, assigned, needsMint, conflicts };
  }

  /** Cancela las reservas `PENDING` cuyo bloqueo ha vencido (D-37). Devuelve cuántas liberó. */
  async expireHolds(now: Date = new Date()): Promise<number> {
    const expired = await this.pool.query(
      `SELECT id FROM reservations WHERE status = 'PENDING' AND hold_expires_at < $1`,
      [now],
    );
    let count = 0;
    for (const row of expired.rows) {
      const cancelled = await this.cancelLike(row.id as string, "CANCELLED", "sistema", "Anticipo no pagado");
      if (cancelled) count += 1;
    }
    return count;
  }

  /**
   * Modifica fechas y/o habitación recalculando el inventario (D-43): libera las noches anteriores y
   * retiene las nuevas en una transacción.
   */
  async modifyReservation(id: string, input: ModifyReservationInput, actor: string): Promise<ReservationRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT * FROM reservations WHERE id = $1 AND status IN ('PENDING','CONFIRMED')`, [id]);
      if (current.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const roomId = input.roomId ?? (current.rows[0].room_id as string);
      const checkIn = input.checkInDate ?? isoDate(current.rows[0].check_in_date);
      const checkOut = input.checkOutDate ?? isoDate(current.rows[0].check_out_date);
      const nights = nightsBetween(checkIn, checkOut);

      // Libera las retenciones previas antes de comprobar las nuevas.
      await client.query(`UPDATE reservation_nights SET active = FALSE WHERE reservation_id = $1`, [id]);
      await this.assertNightsFree(client, roomId, nights);

      for (const nightDate of nights) {
        await client.query(
          `INSERT INTO reservation_nights (reservation_id, room_id, night_date, active) VALUES ($1, $2, $3, TRUE)`,
          [id, roomId, nightDate],
        );
      }

      const updated = await client.query(
        `UPDATE reservations
            SET room_id = $2, check_in_date = $3, check_out_date = $4,
                total_cents = COALESCE($5, total_cents), updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, roomId, checkIn, checkOut, input.totalCents ?? null],
      );
      await client.query(
        `INSERT INTO reservation_status_history (reservation_id, from_value, to_value, changed_by, reason)
         VALUES ($1, $2, $2, $3, 'Modificación de reserva')`,
        [id, current.rows[0].status, actor],
      );
      await client.query("COMMIT");
      return mapReservation(updated.rows[0]);
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new ReservationError("UNAVAILABLE", "Alguna de las noches nuevas ya está reservada.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Registra el anticipo cobrado off-chain (D-60). */
  async recordDeposit(id: string, amountCents: number): Promise<ReservationRecord | null> {
    const res = await this.pool.query(
      `UPDATE reservations SET deposit_paid_cents = deposit_paid_cents + $2, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, amountCents],
    );
    return res.rows.length > 0 ? mapReservation(res.rows[0]) : null;
  }

  /** Enlaza una noche retenida con el token emitido al pagar el 100 % (D-39). */
  async assignToken(reservationId: string, nightDate: string, tokenId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE reservation_nights SET token_id = $3
        WHERE reservation_id = $1 AND night_date = $2 AND active = TRUE`,
      [reservationId, nightDate, tokenId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Devuelve el contacto **descifrado** (D-55) o `null` si no hay o ya se purgó. */
  async getContact(reservationId: string): Promise<ReservationContactInfo | null> {
    const res = await this.pool.query(
      `SELECT channel, value_enc FROM reservation_contacts
        WHERE reservation_id = $1 AND purged_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [reservationId],
    );
    if (res.rows.length === 0) return null;
    return {
      channel: res.rows[0].channel as ReservationContactChannel,
      value: decryptWithKey("AES_SECRET_KEY", res.rows[0].value_enc as string),
    };
  }

  /** Purga los contactos cuya estancia ya terminó (D-55). Devuelve cuántos borró. */
  async purgeContacts(now: Date = new Date()): Promise<number> {
    const res = await this.pool.query(
      `UPDATE reservation_contacts SET value_enc = '', purged_at = $1
        WHERE purged_at IS NULL AND purge_at <= $2`,
      [now, isoDate(now)],
    );
    return res.rowCount ?? 0;
  }

  /** Folio de una reserva. */
  async findFolio(reservationId: string): Promise<FolioRecord | null> {
    const res = await this.pool.query(`SELECT * FROM folios WHERE reservation_id = $1`, [reservationId]);
    return res.rows.length > 0 ? mapFolio(res.rows[0]) : null;
  }

  // ── Internos ────────────────────────────────────────────────────────────────
  private async assertNightsFree(client: PoolClient, roomId: string, nights: string[]): Promise<void> {
    const reserved = await client.query(
      `SELECT night_date::text AS night_date FROM reservation_nights
        WHERE room_id = $1 AND active = TRUE AND night_date = ANY($2::date[])`,
      [roomId, nights],
    );
    if (reserved.rows.length > 0) {
      throw new ReservationError("UNAVAILABLE", "Alguna de las noches ya está reservada.");
    }
    const sold = await client.query(
      `SELECT check_in_date::text AS night_date FROM nfts
        WHERE room_number = (SELECT room_number FROM rooms WHERE id = $1)
          AND status IN ('SOLD','CHECKED_IN','CHECKED_OUT')
          AND check_in_date = ANY($2::date[])`,
      [roomId, nights],
    );
    if (sold.rows.length > 0) {
      throw new ReservationError("UNAVAILABLE", "Alguna de las noches ya está vendida.");
    }
  }

  private async transition(
    id: string,
    status: ReservationBookingStatus,
    actor: string,
    reason: string | undefined,
    timestampColumn: "confirmed_at" | "cancelled_at",
  ): Promise<ReservationRecord | null> {
    // Se lee el estado ANTERIOR para que el historial registre la transición real (from → to).
    const current = await this.pool.query(`SELECT status FROM reservations WHERE id = $1`, [id]);
    if (current.rows.length === 0) return null;
    const fromValue = current.rows[0].status as ReservationBookingStatus;

    const res = await this.pool.query(
      `UPDATE reservations SET status = $2, ${timestampColumn} = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (res.rows.length === 0) return null;
    await this.pool.query(
      `INSERT INTO reservation_status_history (reservation_id, from_value, to_value, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, fromValue, status, actor, reason ?? null],
    );
    return mapReservation(res.rows[0]);
  }

  private async cancelLike(id: string, status: ReservationBookingStatus, actor: string, reason: string): Promise<ReservationRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT status FROM reservations WHERE id = $1 AND status IN ('PENDING','CONFIRMED')`,
        [id],
      );
      if (previous.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const fromValue = previous.rows[0].status as ReservationBookingStatus;
      const updated = await client.query(
        `UPDATE reservations SET status = $2, cancelled_at = NOW(), cancel_reason = $3, updated_at = NOW()
          WHERE id = $1 AND status IN ('PENDING','CONFIRMED') RETURNING *`,
        [id, status, reason],
      );
      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(`UPDATE reservation_nights SET active = FALSE WHERE reservation_id = $1`, [id]);
      await client.query(
        `INSERT INTO reservation_status_history (reservation_id, from_value, to_value, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, fromValue, status, actor, reason],
      );
      await client.query("COMMIT");
      return mapReservation(updated.rows[0]);
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

const ISBN_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === ISBN_UNIQUE_VIOLATION;
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapReservation(row: QueryResultRow): ReservationRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    roomNumber: Number(row.room_number),
    checkInDate: isoDate(row.check_in_date),
    checkOutDate: isoDate(row.check_out_date),
    channel: row.channel as ReservationChannel,
    status: row.status as ReservationBookingStatus,
    totalCents: Number(row.total_cents),
    depositRequiredCents: Number(row.deposit_required_cents),
    depositPaidCents: Number(row.deposit_paid_cents),
    holdExpiresAt: (row.hold_expires_at as Date | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    confirmedAt: (row.confirmed_at as Date | null) ?? null,
    cancelledAt: (row.cancelled_at as Date | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
  };
}

function mapNight(row: QueryResultRow): ReservationNightRecord {
  return {
    id: row.id as string,
    reservationId: row.reservation_id as string,
    roomId: row.room_id as string,
    nightDate: isoDate(row.night_date),
    tokenId: (row.token_id as string | null) ?? null,
    active: row.active as boolean,
  };
}

function mapFolio(row: QueryResultRow): FolioRecord {
  return {
    id: row.id as string,
    reservationId: row.reservation_id as string,
    status: row.status as FolioStatus,
    openedAt: row.opened_at as Date,
    closedAt: (row.closed_at as Date | null) ?? null,
    totalCents: Number(row.total_cents),
  };
}
