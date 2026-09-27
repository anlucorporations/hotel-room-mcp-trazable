import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de Actividades (Suite Administración → Actividades y Front Office, D-44…D-47).
 *
 * Reparto de responsabilidades (D-44): el **administrador** configura el catálogo, los horarios, los
 * cupos y los precios; la **recepción** inscribe a los huéspedes.
 *
 * Reglas que este repositorio hace cumplir:
 *
 *   1. **Cupo estricto** (D-47): nunca se venden más plazas que el aforo. El horario se bloquea con
 *      `FOR UPDATE` durante la inscripción, de modo que dos recepcionistas concurrentes no sobrevendan.
 *   2. **Lista de espera opcional** (D-47): con el horario lleno, la inscripción puede quedar en
 *      `WAITLIST` (sin cargo) o rechazarse; al liberarse una plaza, la primera de la lista **se
 *      promociona** sola.
 *   3. **Solo estancias activas** (D-45): la reserva debe estar `CONFIRMED` y en curso en la fecha.
 *   4. **Cargo al folio** (D-46): la inscripción crea una línea en `additional_charges` ligada al
 *      **folio** de la estancia (sin token propio: el token llega con la liquidación, D-57).
 *
 * **Sin PII de viajeros** (ADR-20/RNF-30): solo se guarda la referencia a la reserva.
 */

export type ActivityBookingStatus = "BOOKED" | "WAITLIST" | "CANCELLED" | "ATTENDED";

export interface ActivityRecord {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string | null;
  nameRu: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  priceCents: number;
  currency: string;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityScheduleRecord {
  id: string;
  activityId: string;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number;
  active: boolean;
  createdAt: Date;
}

/** Horario con su actividad y su ocupación, listo para pintar el catálogo operativo. */
export interface ActivityScheduleWithAvailability extends ActivityScheduleRecord {
  activityCode: string;
  activityNameEs: string;
  activityNameEn: string | null;
  activityNameRu: string | null;
  priceCents: number;
  currency: string;
  activityActive: boolean;
  bookedSeats: number;
  waitlistSeats: number;
  remaining: number;
}

export interface ActivityBookingRecord {
  id: string;
  scheduleId: string;
  reservationId: string;
  seats: number;
  status: ActivityBookingStatus;
  chargeId: string | null;
  createdBy: string;
  createdAt: Date;
  cancelledAt: Date | null;
}

export type ActivityErrorCode =
  | "ACTIVITY_EXISTS"
  | "ACTIVITY_NOT_FOUND"
  | "SCHEDULE_NOT_FOUND"
  | "SCHEDULE_CLOSED"
  | "STAY_NOT_ACTIVE"
  | "INVALID_SEATS"
  | "SOLD_OUT"
  | "BOOKING_NOT_FOUND"
  | "BOOKING_CLOSED";

export class ActivityError extends Error {
  constructor(
    readonly code: ActivityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ActivityError";
  }
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

export class ActivitiesRepository {
  constructor(private pool: Pool = getDbPool()) {}

  // ---------------------------------------------------------------------------
  // Catálogo (administrador, D-44)
  // ---------------------------------------------------------------------------

  async createActivity(input: {
    code: string;
    nameEs: string;
    nameEn?: string | null;
    nameRu?: string | null;
    descriptionEs?: string | null;
    descriptionEn?: string | null;
    descriptionRu?: string | null;
    priceCents?: number;
    currency?: string;
    createdBy: string;
  }): Promise<ActivityRecord> {
    try {
      const res = await this.pool.query(
        `INSERT INTO activities
           (code, name_es, name_en, name_ru, description_es, description_en, description_ru,
            price_cents, currency, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.code,
          input.nameEs,
          input.nameEn ?? null,
          input.nameRu ?? null,
          input.descriptionEs ?? null,
          input.descriptionEn ?? null,
          input.descriptionRu ?? null,
          input.priceCents ?? 0,
          input.currency ?? "EUR",
          input.createdBy,
        ],
      );
      return mapActivity(res.rows[0]);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ActivityError("ACTIVITY_EXISTS", `Ya existe una actividad con el código ${input.code}.`);
      }
      throw error;
    }
  }

  /** Edición parcial del catálogo (nombre, descripciones, precio, moneda y estado). */
  async updateActivity(
    id: string,
    input: {
      nameEs?: string;
      nameEn?: string | null;
      nameRu?: string | null;
      descriptionEs?: string | null;
      descriptionEn?: string | null;
      descriptionRu?: string | null;
      priceCents?: number;
      currency?: string;
      active?: boolean;
    },
  ): Promise<ActivityRecord | null> {
    const columnMap: ReadonlyArray<[keyof typeof input, string]> = [
      ["nameEs", "name_es"],
      ["nameEn", "name_en"],
      ["nameRu", "name_ru"],
      ["descriptionEs", "description_es"],
      ["descriptionEn", "description_en"],
      ["descriptionRu", "description_ru"],
      ["priceCents", "price_cents"],
      ["currency", "currency"],
      ["active", "active"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of columnMap) {
      if (!(key in input)) continue;
      values.push(input[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length === 0) return this.findActivity(id);
    sets.push("updated_at = NOW()");
    values.push(id);
    const res = await this.pool.query(
      `UPDATE activities SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return res.rows.length > 0 ? mapActivity(res.rows[0]) : null;
  }

  async findActivity(id: string): Promise<ActivityRecord | null> {
    const res = await this.pool.query(`SELECT * FROM activities WHERE id = $1`, [id]);
    return res.rows.length > 0 ? mapActivity(res.rows[0]) : null;
  }

  async listActivities(options: { activeOnly?: boolean } = {}): Promise<ActivityRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM activities ${options.activeOnly ? "WHERE active = TRUE" : ""} ORDER BY code ASC`,
    );
    return res.rows.map(mapActivity);
  }

  async createSchedule(input: {
    activityId: string;
    startsAt: Date;
    endsAt?: Date | null;
    capacity: number;
  }): Promise<ActivityScheduleRecord> {
    if (input.capacity <= 0) {
      throw new ActivityError("INVALID_SEATS", "El aforo debe ser mayor que cero.");
    }
    const activity = await this.findActivity(input.activityId);
    if (!activity) throw new ActivityError("ACTIVITY_NOT_FOUND", "La actividad no existe.");
    const res = await this.pool.query(
      `INSERT INTO activity_schedules (activity_id, starts_at, ends_at, capacity)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.activityId, input.startsAt, input.endsAt ?? null, input.capacity],
    );
    return mapSchedule(res.rows[0]);
  }

  async setScheduleActive(id: string, active: boolean): Promise<ActivityScheduleRecord | null> {
    const res = await this.pool.query(
      `UPDATE activity_schedules SET active = $2 WHERE id = $1 RETURNING *`,
      [id, active],
    );
    return res.rows.length > 0 ? mapSchedule(res.rows[0]) : null;
  }

  /** Horarios con su actividad y ocupación (`remaining` = plazas libres, nunca negativo). */
  async listSchedules(
    filter: { activityId?: string; from?: Date; to?: Date; activeOnly?: boolean } = {},
  ): Promise<ActivityScheduleWithAvailability[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.activityId) {
      values.push(filter.activityId);
      where.push(`s.activity_id = $${values.length}`);
    }
    if (filter.from) {
      values.push(filter.from);
      where.push(`s.starts_at >= $${values.length}`);
    }
    if (filter.to) {
      values.push(filter.to);
      where.push(`s.starts_at < $${values.length}`);
    }
    if (filter.activeOnly) {
      where.push(`s.active = TRUE AND a.active = TRUE`);
    }
    const res = await this.pool.query(
      `${SCHEDULE_SELECT} ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.starts_at ASC`,
      values,
    );
    return res.rows.map(mapScheduleAvailability);
  }

  async getSchedule(scheduleId: string): Promise<ActivityScheduleWithAvailability | null> {
    const res = await this.pool.query(`${SCHEDULE_SELECT} WHERE s.id = $1`, [scheduleId]);
    return res.rows.length > 0 ? mapScheduleAvailability(res.rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // Inscripción (recepción, D-45…D-47)
  // ---------------------------------------------------------------------------

  /**
   * Inscribe a un huésped en un horario (D-45…D-47).
   *
   * Si hay plazas, crea la reserva de actividad `BOOKED` y su **cargo al folio** (D-46). Si no las
   * hay y `allowWaitlist`, la deja en `WAITLIST` **sin cargo**; en caso contrario, `SOLD_OUT`.
   */
  async book(input: {
    scheduleId: string;
    reservationId: string;
    seats?: number;
    createdBy: string;
    allowWaitlist?: boolean;
    at?: Date;
  }): Promise<ActivityBookingRecord> {
    const seats = input.seats ?? 1;
    if (!Number.isInteger(seats) || seats <= 0) {
      throw new ActivityError("INVALID_SEATS", "Las plazas deben ser un entero mayor que cero.");
    }
    const today = (input.at ?? new Date()).toISOString().slice(0, 10);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // El cerrojo del horario serializa inscripciones concurrentes: sin él, dos recepcionistas
      // podrían sumar plazas por encima del aforo (D-47).
      const schedule = await client.query(
        `SELECT s.*, a.name_es AS activity_name, a.price_cents, a.currency, a.active AS activity_active
           FROM activity_schedules s
           JOIN activities a ON a.id = s.activity_id
          WHERE s.id = $1 FOR UPDATE OF s`,
        [input.scheduleId],
      );
      if (schedule.rows.length === 0) {
        throw new ActivityError("SCHEDULE_NOT_FOUND", "El horario no existe.");
      }
      const row = schedule.rows[0];
      if (row.active !== true || row.activity_active !== true) {
        throw new ActivityError("SCHEDULE_CLOSED", "La actividad o su horario están desactivados.");
      }
      if (new Date(row.starts_at as Date).getTime() <= (input.at ?? new Date()).getTime()) {
        throw new ActivityError("SCHEDULE_CLOSED", "El horario ya ha comenzado.");
      }

      const stay = await client.query(
        `SELECT id FROM reservations
          WHERE id = $1 AND status = 'CONFIRMED'
            AND check_in_date <= $2::date AND check_out_date > $2::date`,
        [input.reservationId, today],
      );
      if (stay.rows.length === 0) {
        throw new ActivityError(
          "STAY_NOT_ACTIVE",
          "Solo pueden inscribirse huéspedes con una estancia confirmada y en curso (D-45).",
        );
      }

      const bookedRow = await client.query(
        `SELECT COALESCE(SUM(seats), 0) AS booked FROM activity_bookings
          WHERE schedule_id = $1 AND status IN ('BOOKED', 'ATTENDED')`,
        [input.scheduleId],
      );
      const booked = Number(bookedRow.rows[0]?.booked ?? 0);
      const capacity = Number(row.capacity);

      if (booked + seats > capacity) {
        if (input.allowWaitlist !== true) {
          throw new ActivityError("SOLD_OUT", "El horario está completo (D-47).");
        }
        const waitlisted = await client.query(
          `INSERT INTO activity_bookings (schedule_id, reservation_id, seats, status, created_by)
           VALUES ($1, $2, $3, 'WAITLIST', $4) RETURNING *`,
          [input.scheduleId, input.reservationId, seats, input.createdBy],
        );
        await client.query("COMMIT");
        return mapBooking(waitlisted.rows[0]);
      }

      const booking = await client.query(
        `INSERT INTO activity_bookings (schedule_id, reservation_id, seats, status, created_by)
         VALUES ($1, $2, $3, 'BOOKED', $4) RETURNING *`,
        [input.scheduleId, input.reservationId, seats, input.createdBy],
      );
      const chargeId = await chargeForBooking(client, {
        bookingId: booking.rows[0].id as string,
        reservationId: input.reservationId,
        concept: `${row.activity_name as string} · ${new Date(row.starts_at as Date).toISOString().slice(0, 10)}`,
        priceCents: Number(row.price_cents),
        seats,
        currency: row.currency as string,
        createdBy: input.createdBy,
      });
      await client.query("COMMIT");
      return mapBooking({ ...booking.rows[0], charge_id: chargeId });
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancela una inscripción y, si estaba `BOOKED`, **promociona** la primera de la lista de espera
   * (D-47): la plaza se reasigna sola y se le crea su cargo.
   */
  async cancelBooking(
    id: string,
    actor: string,
  ): Promise<{ booking: ActivityBookingRecord; promoted: ActivityBookingRecord | null }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT * FROM activity_bookings WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (current.rows.length === 0) {
        throw new ActivityError("BOOKING_NOT_FOUND", "La inscripción no existe.");
      }
      const booking = current.rows[0];
      if (booking.status === "CANCELLED") {
        throw new ActivityError("BOOKING_CLOSED", "La inscripción ya estaba cancelada.");
      }
      const wasBooked = booking.status === "BOOKED";

      const cancelled = await client.query(
        `UPDATE activity_bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      if (booking.charge_id) {
        await client.query(
          `UPDATE additional_charges
              SET status = 'CANCELLED', cancelled_by = $2, cancelled_at = NOW(),
                  cancel_reason = COALESCE(cancel_reason, 'Actividad cancelada')
            WHERE id = $1 AND status = 'PENDING'`,
          [booking.charge_id, actor],
        );
      }

      let promoted: ActivityBookingRecord | null = null;
      if (wasBooked) {
        const waitlist = await client.query(
          `SELECT * FROM activity_bookings
            WHERE schedule_id = $1 AND status = 'WAITLIST'
            ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [booking.schedule_id],
        );
        if (waitlist.rows.length > 0) {
          const info = await client.query(
            `SELECT s.capacity, a.name_es AS activity_name, a.price_cents, a.currency, s.starts_at
               FROM activity_schedules s JOIN activities a ON a.id = s.activity_id
              WHERE s.id = $1`,
            [booking.schedule_id],
          );
          const occupied = await client.query(
            `SELECT COALESCE(SUM(seats), 0) AS booked FROM activity_bookings
              WHERE schedule_id = $1 AND status IN ('BOOKED', 'ATTENDED')`,
            [booking.schedule_id],
          );
          const infoRow = info.rows[0];
          const seats = Number(waitlist.rows[0].seats);
          const fits = Number(occupied.rows[0]?.booked ?? 0) + seats <= Number(infoRow.capacity);
          if (fits) {
            const promotedRow = await client.query(
              `UPDATE activity_bookings SET status = 'BOOKED' WHERE id = $1 RETURNING *`,
              [waitlist.rows[0].id],
            );
            const chargeId = await chargeForBooking(client, {
              bookingId: waitlist.rows[0].id as string,
              reservationId: waitlist.rows[0].reservation_id as string,
              concept: `${infoRow.activity_name as string} · ${new Date(infoRow.starts_at as Date).toISOString().slice(0, 10)}`,
              priceCents: Number(infoRow.price_cents),
              seats,
              currency: infoRow.currency as string,
              createdBy: actor,
            });
            promoted = mapBooking({ ...promotedRow.rows[0], charge_id: chargeId });
          }
        }
      }

      await client.query("COMMIT");
      return { booking: mapBooking(cancelled.rows[0]), promoted };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listBookings(
    filter: { scheduleId?: string; reservationId?: string } = {},
  ): Promise<ActivityBookingRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter.scheduleId) {
      values.push(filter.scheduleId);
      where.push(`schedule_id = $${values.length}`);
    }
    if (filter.reservationId) {
      values.push(filter.reservationId);
      where.push(`reservation_id = $${values.length}`);
    }
    const res = await this.pool.query(
      `SELECT * FROM activity_bookings ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at ASC`,
      values,
    );
    return res.rows.map(mapBooking);
  }
}

const SCHEDULE_SELECT = `SELECT s.*, a.code AS activity_code, a.name_es AS activity_name_es,
       a.name_en AS activity_name_en, a.name_ru AS activity_name_ru,
       a.price_cents, a.currency, a.active AS activity_active,
       COALESCE((SELECT SUM(b.seats) FROM activity_bookings b
                  WHERE b.schedule_id = s.id AND b.status IN ('BOOKED', 'ATTENDED')), 0) AS booked_seats,
       COALESCE((SELECT SUM(b.seats) FROM activity_bookings b
                  WHERE b.schedule_id = s.id AND b.status = 'WAITLIST'), 0) AS waitlist_seats
   FROM activity_schedules s
   JOIN activities a ON a.id = s.activity_id`;

/**
 * Crea el cargo al folio de una inscripción (D-46). Devuelve el `charge_id` o `null` si la actividad
 * es gratuita. El cargo se liga al **folio** de la reserva; el `token_id` se rellena si esa estancia
 * ya tiene alguna noche emitida, y si no queda a `NULL` (el token llega con la liquidación, D-57).
 */
async function chargeForBooking(
  client: PoolClient,
  input: {
    bookingId: string;
    reservationId: string;
    concept: string;
    priceCents: number;
    seats: number;
    currency: string;
    createdBy: string;
  },
): Promise<string | null> {
  if (input.priceCents <= 0 || input.seats <= 0) return null;

  const folio = await client.query(`SELECT id FROM folios WHERE reservation_id = $1 LIMIT 1`, [
    input.reservationId,
  ]);
  const token = await client.query(
    `SELECT token_id FROM reservation_nights
      WHERE reservation_id = $1 AND token_id IS NOT NULL LIMIT 1`,
    [input.reservationId],
  );
  const charge = await client.query(
    `INSERT INTO additional_charges (token_id, concept, amount_cents, currency, status, created_by, folio_id)
     VALUES ($1, $2, $3, $4, 'PENDING', $5, $6) RETURNING id`,
    [
      (token.rows[0]?.token_id as string | undefined) ?? null,
      input.concept,
      input.priceCents * input.seats,
      input.currency,
      input.createdBy,
      (folio.rows[0]?.id as string | undefined) ?? null,
    ],
  );
  const chargeId = charge.rows[0].id as string;
  await client.query(`UPDATE activity_bookings SET charge_id = $2 WHERE id = $1`, [
    input.bookingId,
    chargeId,
  ]);
  return chargeId;
}

// -----------------------------------------------------------------------------
// Traducción snake_case → camelCase
// -----------------------------------------------------------------------------

function mapActivity(row: QueryResultRow): ActivityRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    nameEs: row.name_es as string,
    nameEn: (row.name_en as string | null) ?? null,
    nameRu: (row.name_ru as string | null) ?? null,
    descriptionEs: (row.description_es as string | null) ?? null,
    descriptionEn: (row.description_en as string | null) ?? null,
    descriptionRu: (row.description_ru as string | null) ?? null,
    priceCents: Number(row.price_cents),
    currency: row.currency as string,
    active: row.active as boolean,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapSchedule(row: QueryResultRow): ActivityScheduleRecord {
  return {
    id: row.id as string,
    activityId: row.activity_id as string,
    startsAt: row.starts_at as Date,
    endsAt: (row.ends_at as Date | null) ?? null,
    capacity: Number(row.capacity),
    active: row.active as boolean,
    createdAt: row.created_at as Date,
  };
}

function mapScheduleAvailability(row: QueryResultRow): ActivityScheduleWithAvailability {
  const bookedSeats = Number(row.booked_seats ?? 0);
  const capacity = Number(row.capacity);
  return {
    ...mapSchedule(row),
    activityCode: row.activity_code as string,
    activityNameEs: row.activity_name_es as string,
    activityNameEn: (row.activity_name_en as string | null) ?? null,
    activityNameRu: (row.activity_name_ru as string | null) ?? null,
    priceCents: Number(row.price_cents),
    currency: row.currency as string,
    activityActive: row.activity_active as boolean,
    bookedSeats,
    waitlistSeats: Number(row.waitlist_seats ?? 0),
    remaining: Math.max(0, capacity - bookedSeats),
  };
}

function mapBooking(row: QueryResultRow): ActivityBookingRecord {
  return {
    id: row.id as string,
    scheduleId: row.schedule_id as string,
    reservationId: row.reservation_id as string,
    seats: Number(row.seats),
    status: row.status as ActivityBookingStatus,
    chargeId: (row.charge_id as string | null) ?? null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as Date,
    cancelledAt: (row.cancelled_at as Date | null) ?? null,
  };
}
