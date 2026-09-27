import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { encryptWithKey } from "../../auth/crypto";
import { nightsBetween, ReservationError, ReservationsRepository } from "./reservations.repository";

/** Cliente transaccional simulado: enruta por palabra clave del SQL. */
function fakeClient(handlers: {
  room?: QueryResultRow[];
  reservedNights?: QueryResultRow[];
  soldNights?: QueryResultRow[];
  insertReservation?: QueryResultRow;
  updateReservation?: QueryResultRow;
  currentReservation?: QueryResultRow;
  reservationStatus?: string;
}): PoolClient & { query: Mock; release: Mock } {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql);
    // El orden importa: la consulta de noches vendidas incluye un subquery `FROM rooms`, así que se
    // comprueba `FROM nfts` ANTES que `FROM rooms`.
    if (s.includes("FROM nfts")) return { rows: handlers.soldNights ?? [], rowCount: 0 };
    if (s.includes("FROM reservation_nights")) return { rows: handlers.reservedNights ?? [], rowCount: 0 };
    if (s.includes("SELECT * FROM reservations")) {
      return { rows: [handlers.currentReservation ?? reservationRow()], rowCount: 1 };
    }
    if (s.includes("SELECT status FROM reservations")) {
      return { rows: [{ status: handlers.reservationStatus ?? "PENDING" }], rowCount: 1 };
    }
    if (s.includes("FROM rooms")) return { rows: handlers.room ?? [{ id: "room-1", room_number: 101 }], rowCount: 1 };
    if (s.includes("INSERT INTO reservations")) {
      return {
        rows: [handlers.insertReservation ?? reservationRow()],
        rowCount: 1,
      };
    }
    if (s.includes("UPDATE reservations")) {
      return { rows: [handlers.updateReservation ?? reservationRow()], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() } as unknown as PoolClient & { query: Mock; release: Mock };
}

function reservationRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "res-1",
    room_id: "room-1",
    room_number: 101,
    check_in_date: "2026-10-01",
    check_out_date: "2026-10-03",
    channel: "COUNTER",
    status: "PENDING",
    total_cents: 20000,
    deposit_required_cents: 6000,
    deposit_paid_cents: 0,
    hold_expires_at: new Date("2026-09-27T00:00:00Z"),
    created_by: "admin@hotel.es",
    created_at: new Date("2026-09-26T00:00:00Z"),
    updated_at: new Date("2026-09-26T00:00:00Z"),
    confirmed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  };
}

describe("ReservationsRepository (F2 · D-34…D-43, D-55, D-57, D-60)", () => {
  let repository: ReservationsRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new ReservationsRepository(mockPool);
  });

  describe("nightsBetween", () => {
    it("devuelve las noches [entrada, salida) (D-43)", () => {
      expect(nightsBetween("2026-10-01", "2026-10-04")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    });

    it("rechaza una salida no posterior a la entrada", () => {
      expect(() => nightsBetween("2026-10-03", "2026-10-03")).toThrow(ReservationError);
      expect(() => nightsBetween("2026-10-05", "2026-10-01")).toThrow(ReservationError);
    });
  });

  describe("checkAvailability (D-41/D-57)", () => {
    it("marca FREE, RESERVED y SOLD según reservas y tokens", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ night_date: "2026-10-02" }] })
        .mockResolvedValueOnce({ rows: [{ night_date: "2026-10-03" }] });

      const nights = await repository.checkAvailability("room-1", "2026-10-01", "2026-10-04");
      expect(nights).toEqual([
        { nightDate: "2026-10-01", status: "FREE" },
        { nightDate: "2026-10-02", status: "RESERVED" },
        { nightDate: "2026-10-03", status: "SOLD" },
      ]);
    });
  });

  describe("createReservation (D-35/D-37/D-55/D-60)", () => {
    it("retiene las noches, abre folio, cifra el contacto y deja historial", async () => {
      const client = fakeClient({});
      mockPool.connect.mockResolvedValueOnce(client);

      const reservation = await repository.createReservation({
        roomId: "room-1",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-03",
        channel: "COUNTER",
        createdBy: "admin@hotel.es",
        totalCents: 20000,
        contact: { channel: "EMAIL", value: "huesped@example.com" },
      });

      expect(reservation.id).toBe("res-1");
      expect(reservation.depositRequiredCents).toBe(6000); // 30 % por defecto (D-37)
      const statements = client.query.mock.calls.map((call) => String(call[0]));
      expect(statements.some((s) => s.includes("INSERT INTO reservation_nights"))).toBe(true);
      expect(statements.some((s) => s.includes("INSERT INTO folios"))).toBe(true);
      expect(statements.some((s) => s.includes("INSERT INTO reservation_contacts"))).toBe(true);
      expect(statements.some((s) => s.includes("COMMIT"))).toBe(true);
      // El contacto se guarda cifrado: el valor en claro no aparece en el SQL.
      const contactCall = client.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO reservation_contacts"));
      expect(JSON.stringify(contactCall)).not.toContain("huesped@example.com");
      expect(client.release).toHaveBeenCalled();
    });

    it("rechaza con ROOM_NOT_FOUND si la habitación no existe", async () => {
      const client = fakeClient({ room: [] });
      mockPool.connect.mockResolvedValueOnce(client);
      await expect(
        repository.createReservation({
          roomId: "nope",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-02",
          channel: "COUNTER",
          createdBy: "admin@hotel.es",
          totalCents: 10000,
        }),
      ).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
    });

    it("rechaza con UNAVAILABLE si una noche ya está reservada (D-41)", async () => {
      const client = fakeClient({ reservedNights: [{ night_date: "2026-10-01" }] });
      mockPool.connect.mockResolvedValueOnce(client);
      await expect(
        repository.createReservation({
          roomId: "room-1",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-03",
          channel: "COUNTER",
          createdBy: "admin@hotel.es",
          totalCents: 20000,
        }),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    });

    it("rechaza con UNAVAILABLE si una noche ya está vendida (D-57)", async () => {
      const client = fakeClient({ soldNights: [{ night_date: "2026-10-02" }] });
      mockPool.connect.mockResolvedValueOnce(client);
      await expect(
        repository.createReservation({
          roomId: "room-1",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-03",
          channel: "COUNTER",
          createdBy: "admin@hotel.es",
          totalCents: 20000,
        }),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    });
  });

  describe("cancelReservation (D-40)", () => {
    it("libera las noches y registra el historial", async () => {
      const client = fakeClient({ updateReservation: reservationRow({ status: "CANCELLED" }) });
      mockPool.connect.mockResolvedValueOnce(client);
      const cancelled = await repository.cancelReservation("res-1", "admin@hotel.es", "El huésped avisó");
      expect(cancelled?.status).toBe("CANCELLED");
      const statements = client.query.mock.calls.map((call) => String(call[0]));
      expect(statements.some((s) => s.includes("active = FALSE"))).toBe(true);
    });
  });

  describe("expireHolds (D-37)", () => {
    it("cancela las reservas PENDING vencidas y libera inventario", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: "res-1" }, { id: "res-2" }] });
      const client = fakeClient({});
      mockPool.connect.mockResolvedValue(client);

      const count = await repository.expireHolds(new Date("2026-09-27T00:00:00Z"));
      expect(count).toBe(2);
    });
  });

  describe("contacto cifrado (D-55)", () => {
    it("descifra el contacto guardado", async () => {
      const encrypted = encryptWithKey("AES_SECRET_KEY", "huesped@example.com");
      mockPool.query.mockResolvedValueOnce({ rows: [{ channel: "EMAIL", value_enc: encrypted }] });
      const contact = await repository.getContact("res-1");
      expect(contact).toEqual({ channel: "EMAIL", value: "huesped@example.com" });
    });

    it("devuelve null si no hay contacto", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.getContact("res-1")).toBeNull();
    });

    it("purga los contactos de estancias terminadas", async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 3 });
      expect(await repository.purgeContacts(new Date("2026-10-05T00:00:00Z"))).toBe(3);
      const sql = String(mockPool.query.mock.calls[0][0]);
      expect(sql).toContain("purged_at");
    });
  });

  describe("assignToken (D-39/D-57)", () => {
    it("enlaza la noche con el token emitido", async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
      expect(await repository.assignToken("res-1", "2026-10-01", "10120261001")).toBe(true);
    });
  });

  describe("isNightReserved (D-57)", () => {
    it("detecta una noche retenida por una reserva activa", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      expect(await repository.isNightReserved(101, "2026-10-01")).toBe(true);
      expect(String(mockPool.query.mock.calls[0][0])).toContain("reservation_nights");
    });

    it("devuelve false si no hay reserva activa", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.isNightReserved(101, "2026-10-01")).toBe(false);
    });
  });

  describe("planSettlement (D-57)", () => {
    const nightRow = (nightDate: string, tokenId: string | null) => ({
      id: `night-${nightDate}`,
      reservation_id: "res-1",
      room_id: "room-1",
      night_date: nightDate,
      token_id: tokenId,
      active: true,
    });

    it("asigna el token no vendido, pide acuñar el que falta y no reporta conflicto", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [reservationRow()] }) // findById: reserva
        .mockResolvedValueOnce({ rows: [nightRow("2026-10-01", "tok-1"), nightRow("2026-10-02", null), nightRow("2026-10-03", null)] })
        .mockResolvedValueOnce({ rows: [{ token_id: "tok-2", status: "AVAILABLE" }] }) // 02
        .mockResolvedValueOnce({ rowCount: 1 }) // assignToken 02
        .mockResolvedValueOnce({ rows: [] }); // 03 no existe

      const plan = await repository.planSettlement("res-1");
      expect(plan?.assigned).toEqual([
        { nightDate: "2026-10-01", tokenId: "tok-1" },
        { nightDate: "2026-10-02", tokenId: "tok-2" },
      ]);
      expect(plan?.needsMint).toEqual(["2026-10-03"]);
      expect(plan?.conflicts).toEqual([]);
    });

    it("reporta conflicto si la noche ya está vendida", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [reservationRow()] })
        .mockResolvedValueOnce({ rows: [nightRow("2026-10-02", null)] })
        .mockResolvedValueOnce({ rows: [{ token_id: "tok-9", status: "SOLD" }] });

      const plan = await repository.planSettlement("res-1");
      expect(plan?.conflicts).toEqual(["2026-10-02"]);
      expect(plan?.assigned).toEqual([]);
    });

    it("devuelve null si la reserva no existe", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.planSettlement("nope")).toBeNull();
    });
  });

  describe("markNoShows (D-42)", () => {
    it("marca como no-show las confirmadas cuya entrada pasó", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: "res-1" }] }); // selección
      const client = fakeClient({ updateReservation: reservationRow({ status: "NO_SHOW" }) });
      mockPool.connect.mockResolvedValueOnce(client);

      expect(await repository.markNoShows(new Date("2026-10-05T20:00:00Z"), 18)).toBe(1);
      // El estado va parametrizado ($2), no literal en el SQL.
      expect(client.query.mock.calls.some((call) => JSON.stringify(call[1] ?? "").includes("NO_SHOW"))).toBe(true);
    });
  });

  describe("historial de estados", () => {
    it("confirmar registra la transición real PENDING → CONFIRMED", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ status: "PENDING" }] }) // SELECT status previo
        .mockResolvedValueOnce({ rows: [reservationRow({ status: "CONFIRMED" })] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // INSERT historial

      const confirmed = await repository.confirmReservation("res-1", "admin@hotel.es");
      expect(confirmed?.status).toBe("CONFIRMED");
      const historyParams = mockPool.query.mock.calls[2][1];
      expect(historyParams).toEqual(["res-1", "PENDING", "CONFIRMED", "admin@hotel.es", null]);
    });

    it("cancelar registra el estado previo, no NULL", async () => {
      const client = fakeClient({
        reservationStatus: "CONFIRMED",
        updateReservation: reservationRow({ status: "CANCELLED" }),
      });
      mockPool.connect.mockResolvedValueOnce(client);

      await repository.cancelReservation("res-1", "admin@hotel.es", "Avisó");
      const historyCall = client.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO reservation_status_history"));
      // `'CANCELLED'` va literal en el SQL; los parámetros son id, estado previo, actor y motivo.
      expect(historyCall?.[1]).toEqual(["res-1", "CONFIRMED", "admin@hotel.es", "Avisó"]);
      expect(String(historyCall?.[0])).toContain("'CANCELLED'");
    });
  });
});
