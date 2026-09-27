import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { ActivitiesRepository, ActivityError } from "./activities.repository";

/** Pruebas del repositorio de Actividades (F5 · D-44…D-47). */

function activityRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "act-1",
    code: "KAYAK",
    name_es: "Kayak",
    name_en: "Kayak",
    name_ru: "Каяк",
    description_es: null,
    description_en: null,
    description_ru: null,
    price_cents: 2500,
    currency: "EUR",
    active: true,
    created_by: "admin@hotel.es",
    created_at: new Date("2026-09-01T00:00:00Z"),
    updated_at: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function scheduleRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "sch-1",
    activity_id: "act-1",
    starts_at: new Date("2026-09-28T10:00:00Z"),
    ends_at: null,
    capacity: 4,
    active: true,
    created_at: new Date("2026-09-01T00:00:00Z"),
    activity_name: "Kayak",
    price_cents: 2500,
    currency: "EUR",
    activity_active: true,
    ...overrides,
  };
}

function bookingRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "bk-1",
    schedule_id: "sch-1",
    reservation_id: "res-1",
    seats: 2,
    status: "BOOKED",
    charge_id: null,
    created_by: "recepcion@hotel.es",
    created_at: new Date("2026-09-27T09:00:00Z"),
    cancelled_at: null,
    ...overrides,
  };
}

function fakeTxClient(handlers: {
  schedule?: QueryResultRow | null;
  stay?: QueryResultRow[];
  booked?: number;
  folio?: QueryResultRow[];
  token?: QueryResultRow[];
  chargeId?: string;
  currentBooking?: QueryResultRow | null;
  waitlist?: QueryResultRow[];
  scheduleInfo?: QueryResultRow;
  occupied?: number;
}): PoolClient & { query: Mock; release: Mock } {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };

    if (s.startsWith("SELECT s.*, a.name_es AS activity_name")) {
      const schedule = handlers.schedule === undefined ? scheduleRow() : handlers.schedule;
      return { rows: schedule ? [schedule] : [], rowCount: schedule ? 1 : 0 };
    }
    if (s.startsWith("SELECT id FROM reservations")) {
      return { rows: handlers.stay ?? [{ id: "res-1" }], rowCount: (handlers.stay ?? [{ id: "res-1" }]).length };
    }
    if (s.startsWith("SELECT COALESCE(SUM(seats), 0) AS booked")) {
      const booked = s.includes("status = 'WAITLIST'") ? 0 : handlers.booked ?? 0;
      return { rows: [{ booked: String(booked) }], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO activity_bookings")) {
      // El estado va como literal en el SQL (no como parámetro): WAITLIST o BOOKED.
      const status = s.includes("'WAITLIST'") ? "WAITLIST" : "BOOKED";
      return { rows: [bookingRow({ status, seats: Number(values?.[2] ?? 1), charge_id: null })], rowCount: 1 };
    }
    if (s.startsWith("SELECT id FROM folios")) return { rows: handlers.folio ?? [{ id: "folio-1" }], rowCount: 1 };
    if (s.startsWith("SELECT token_id FROM reservation_nights")) {
      return { rows: handlers.token ?? [], rowCount: (handlers.token ?? []).length };
    }
    if (s.startsWith("INSERT INTO additional_charges")) {
      return { rows: [{ id: handlers.chargeId ?? "charge-1" }], rowCount: 1 };
    }
    if (s.startsWith("UPDATE activity_bookings SET charge_id")) return { rows: [], rowCount: 1 };

    if (s.startsWith("SELECT * FROM activity_bookings WHERE id = $1 FOR UPDATE")) {
      const current = handlers.currentBooking === undefined ? bookingRow() : handlers.currentBooking;
      return { rows: current ? [current] : [], rowCount: current ? 1 : 0 };
    }
    if (s.startsWith("UPDATE activity_bookings SET status = 'CANCELLED'")) {
      return { rows: [bookingRow({ status: "CANCELLED", cancelled_at: new Date() })], rowCount: 1 };
    }
    if (s.startsWith("UPDATE additional_charges")) return { rows: [], rowCount: 1 };
    if (s.includes("status = 'WAITLIST'") && s.includes("ORDER BY created_at ASC")) {
      return { rows: handlers.waitlist ?? [], rowCount: (handlers.waitlist ?? []).length };
    }
    if (s.startsWith("SELECT s.capacity, a.name_es AS activity_name")) {
      return { rows: [handlers.scheduleInfo ?? scheduleRow()], rowCount: 1 };
    }
    if (s.startsWith("UPDATE activity_bookings SET status = 'BOOKED'")) {
      return { rows: [bookingRow({ status: "BOOKED", id: "bk-wait" })], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() } as unknown as PoolClient & { query: Mock; release: Mock };
}

describe("ActivitiesRepository (F5 · D-44…D-47)", () => {
  let repository: ActivitiesRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn(), connect: vi.fn() } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new ActivitiesRepository(mockPool);
  });

  it("crea una actividad y traduce el código duplicado", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [activityRow()], rowCount: 1 });
    const activity = await repository.createActivity({
      code: "KAYAK",
      nameEs: "Kayak",
      priceCents: 2500,
      createdBy: "admin@hotel.es",
    });
    expect(activity.code).toBe("KAYAK");

    mockPool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(
      repository.createActivity({ code: "KAYAK", nameEs: "Kayak", createdBy: "admin@hotel.es" }),
    ).rejects.toMatchObject({ code: "ACTIVITY_EXISTS" });
  });

  it("calcula la ocupación y las plazas libres de un horario", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          ...scheduleRow({ capacity: 4 }),
          activity_code: "KAYAK",
          activity_name_es: "Kayak",
          activity_name_en: null,
          activity_name_ru: null,
          booked_seats: "3",
          waitlist_seats: "1",
        },
      ],
      rowCount: 1,
    });
    const [schedule] = await repository.listSchedules();
    expect(schedule?.bookedSeats).toBe(3);
    expect(schedule?.remaining).toBe(1);
    expect(schedule?.waitlistSeats).toBe(1);
  });

  it("inscribe con cargo al folio cuando hay plazas (D-46)", async () => {
    const client = fakeTxClient({ booked: 0 });
    mockPool.connect.mockResolvedValueOnce(client);
    const booking = await repository.book({
      scheduleId: "sch-1",
      reservationId: "res-1",
      seats: 2,
      createdBy: "recepcion@hotel.es",
      at: new Date("2026-09-27T08:00:00Z"),
    });
    expect(booking.status).toBe("BOOKED");
    expect(booking.chargeId).toBe("charge-1");
    const sqls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("INSERT INTO additional_charges"))).toBe(true);
    // El cargo va al folio y con token nulo si la estancia aún no tiene noches emitidas.
    const charge = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO additional_charges"));
    const chargeValues = charge?.[1] as unknown[];
    expect(chargeValues[0]).toBeNull();
    expect(chargeValues[5]).toBe("folio-1");
  });

  it("rechaza con SOLD_OUT si el horario está completo y no se permite espera (D-47)", async () => {
    mockPool.connect.mockResolvedValueOnce(fakeTxClient({ booked: 4 }));
    await expect(
      repository.book({ scheduleId: "sch-1", reservationId: "res-1", createdBy: "recepcion@hotel.es", at: new Date("2026-09-27T08:00:00Z") }),
    ).rejects.toMatchObject({ code: "SOLD_OUT" });
  });

  it("deja en lista de espera sin cargo si se permite (D-47)", async () => {
    const client = fakeTxClient({ booked: 4 });
    mockPool.connect.mockResolvedValueOnce(client);
    const booking = await repository.book({
      scheduleId: "sch-1",
      reservationId: "res-1",
      createdBy: "recepcion@hotel.es",
      allowWaitlist: true,
      at: new Date("2026-09-27T08:00:00Z"),
    });
    expect(booking.status).toBe("WAITLIST");
    expect(booking.chargeId).toBeNull();
    const sqls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("INSERT INTO additional_charges"))).toBe(false);
  });

  it("exige una estancia activa (D-45)", async () => {
    mockPool.connect.mockResolvedValueOnce(fakeTxClient({ stay: [] }));
    await expect(
      repository.book({ scheduleId: "sch-1", reservationId: "res-1", createdBy: "recepcion@hotel.es", at: new Date("2026-09-27T08:00:00Z") }),
    ).rejects.toMatchObject({ code: "STAY_NOT_ACTIVE" });
  });

  it("rechaza un horario ya comenzado", async () => {
    mockPool.connect.mockResolvedValueOnce(
      fakeTxClient({ schedule: scheduleRow({ starts_at: new Date("2026-09-27T07:00:00Z") }) }),
    );
    await expect(
      repository.book({ scheduleId: "sch-1", reservationId: "res-1", createdBy: "recepcion@hotel.es", at: new Date("2026-09-27T08:00:00Z") }),
    ).rejects.toMatchObject({ code: "SCHEDULE_CLOSED" });
  });

  it("rechaza plazas inválidas", async () => {
    await expect(
      repository.book({ scheduleId: "sch-1", reservationId: "res-1", seats: 0, createdBy: "recepcion@hotel.es" }),
    ).rejects.toMatchObject({ code: "INVALID_SEATS" });
  });

  it("al cancelar una plaza promociona la lista de espera (D-47)", async () => {
    const client = fakeTxClient({
      currentBooking: bookingRow({ status: "BOOKED", charge_id: "charge-1" }),
      waitlist: [bookingRow({ id: "bk-wait", status: "WAITLIST", seats: 1 })],
      occupied: 0,
    });
    mockPool.connect.mockResolvedValueOnce(client);
    const { booking, promoted } = await repository.cancelBooking("bk-1", "recepcion@hotel.es");
    expect(booking.status).toBe("CANCELLED");
    expect(promoted?.id).toBe("bk-wait");
    const sqls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("UPDATE additional_charges"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("UPDATE activity_bookings SET status = 'BOOKED'"))).toBe(true);
  });

  it("no promociona si lo cancelado estaba en espera", async () => {
    const client = fakeTxClient({ currentBooking: bookingRow({ status: "WAITLIST" }) });
    mockPool.connect.mockResolvedValueOnce(client);
    const { promoted } = await repository.cancelBooking("bk-1", "recepcion@hotel.es");
    expect(promoted).toBeNull();
  });

  it("no vuelve a cancelar una inscripción ya cancelada", async () => {
    mockPool.connect.mockResolvedValueOnce(fakeTxClient({ currentBooking: bookingRow({ status: "CANCELLED" }) }));
    await expect(repository.cancelBooking("bk-1", "recepcion@hotel.es")).rejects.toBeInstanceOf(ActivityError);
  });
});
