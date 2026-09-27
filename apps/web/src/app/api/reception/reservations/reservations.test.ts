import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import { ReservationError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockSettings, mockMaintenance } = vi.hoisted(() => ({
  mockRepo: {
    checkAvailability: vi.fn(),
    listReservations: vi.fn(),
    createReservation: vi.fn(),
    findFolio: vi.fn(),
    findById: vi.fn(),
    getContact: vi.fn(),
    modifyReservation: vi.fn(),
    cancelReservation: vi.fn(),
    confirmReservation: vi.fn(),
    recordDeposit: vi.fn(),
    planSettlement: vi.fn(),
  },
  mockSettings: { getNumber: vi.fn(), get: vi.fn(), set: vi.fn() },
  mockMaintenance: { isRoomBlocked: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    ReservationsRepository: vi.fn(() => mockRepo),
    SettingsRepository: vi.fn(() => mockSettings),
    MaintenanceRepository: vi.fn(() => mockMaintenance),
  };
});

import { GET as availabilityGET } from "../availability/route";
import { GET as listGET, POST as createPOST } from "./route";
import { GET as detailGET, PATCH as modifyPATCH, DELETE as cancelDELETE } from "./[id]/route";
import { POST as confirmPOST } from "./[id]/confirm/route";
import { POST as depositPOST } from "./[id]/deposit/route";
import { POST as settlePOST } from "./[id]/settle/route";

const reservation = {
  id: "res-1",
  roomId: "room-1",
  roomNumber: 101,
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-03",
  channel: "COUNTER",
  status: "PENDING",
  totalCents: 20000,
  depositRequiredCents: 6000,
  depositPaidCents: 0,
  holdExpiresAt: new Date(),
  createdBy: "recepcion@hotel.es",
  createdAt: new Date(),
  updatedAt: new Date(),
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
};

const json = (method: string, url: string, body?: unknown): NextRequest =>
  new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

const idParams = (id = "res-1") => ({ params: Promise.resolve({ id }) });

describe("API recepción · reservas (F2 · D-34…D-43, D-55, D-60)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sin configuración persistida, los ajustes devuelven su respaldo (24 h / 30 %) — D-37.
    mockSettings.getNumber.mockImplementation(async (_key: string, fallback: number) => fallback);
    // Sin averías abiertas, la habitación no está bloqueada (D-53).
    mockMaintenance.isRoomBlocked.mockResolvedValue(false);
    resetGuardState();
  });

  it("todas las rutas exigen RECEPTION_ROLE", async () => {
    await listGET(json("GET", "http://localhost/api/reception/reservations"));
    expect(lastRequiredRole()).toBe("RECEPTION_ROLE");
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await listGET(json("GET", "http://localhost/api/reception/reservations"));
    expect(res.status).toBe(401);
  });

  describe("disponibilidad", () => {
    it("devuelve las noches y si están todas libres (D-41)", async () => {
      mockRepo.checkAvailability.mockResolvedValueOnce([
        { nightDate: "2026-10-01", status: "FREE" },
        { nightDate: "2026-10-02", status: "RESERVED" },
      ]);
      const res = await availabilityGET(
        json("GET", "http://localhost/api/reception/availability?roomId=room-1&from=2026-10-01&to=2026-10-03"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.available).toBe(false);
      expect(data.nights).toHaveLength(2);
    });

    it("exige roomId, from y to", async () => {
      const res = await availabilityGET(json("GET", "http://localhost/api/reception/availability"));
      expect(res.status).toBe(400);
    });

    it("marca la habitación como bloqueada si hay una avería abierta (F4 · D-53)", async () => {
      mockRepo.checkAvailability.mockResolvedValueOnce([{ nightDate: "2026-10-01", status: "FREE" }]);
      mockMaintenance.isRoomBlocked.mockResolvedValueOnce(true);
      const res = await availabilityGET(
        json("GET", "http://localhost/api/reception/availability?roomId=room-1&from=2026-10-01&to=2026-10-02"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toMatchObject({ blocked: true, available: false });
    });
  });

  describe("alta de reserva", () => {
    it("crea la reserva y devuelve el folio", async () => {
      mockRepo.createReservation.mockResolvedValueOnce(reservation);
      mockRepo.findFolio.mockResolvedValueOnce({ id: "folio-1", status: "OPEN" });
      const res = await createPOST(
        json("POST", "http://localhost/api/reception/reservations", {
          roomId: "room-1",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-03",
          totalCents: 20000,
          contact: { channel: "EMAIL", value: "huesped@example.com" },
        }),
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.reservation.id).toBe("res-1");
      expect(data.folio.status).toBe("OPEN");
      // El contacto se pasa al repositorio para cifrarlo; no se guarda en claro aquí.
      expect(mockRepo.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({ contact: { channel: "EMAIL", value: "huesped@example.com" } }),
      );
    });

    it("usa el anticipo configurado en los ajustes (D-37)", async () => {
      mockSettings.getNumber.mockImplementation(async (key: string, fallback: number) =>
        key === "reservation_deposit_percent" ? 50 : fallback,
      );
      mockRepo.createReservation.mockResolvedValueOnce(reservation);
      mockRepo.findFolio.mockResolvedValueOnce({ id: "folio-1", status: "OPEN" });

      await createPOST(
        json("POST", "http://localhost/api/reception/reservations", {
          roomId: "room-1",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-03",
          totalCents: 20000,
        }),
      );
      expect(mockRepo.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({ depositRequiredCents: 10000 }),
      );
    });

    it("devuelve 409 UNAVAILABLE sin sobreventa (D-41)", async () => {
      mockRepo.createReservation.mockRejectedValueOnce(new ReservationError("UNAVAILABLE", "ocupada"));
      const res = await createPOST(
        json("POST", "http://localhost/api/reception/reservations", {
          roomId: "room-1",
          checkInDate: "2026-10-01",
          checkOutDate: "2026-10-03",
          totalCents: 20000,
        }),
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("UNAVAILABLE");
    });

    it("rechaza fechas mal formadas", async () => {
      const res = await createPOST(
        json("POST", "http://localhost/api/reception/reservations", {
          roomId: "room-1",
          checkInDate: "01/10/2026",
          checkOutDate: "2026-10-03",
          totalCents: 20000,
        }),
      );
      expect(res.status).toBe(400);
      expect(mockRepo.createReservation).not.toHaveBeenCalled();
    });
  });

  describe("detalle, modificación y cancelación", () => {
    it("GET devuelve reserva, noches, folio y contacto", async () => {
      mockRepo.findById.mockResolvedValueOnce({ reservation, nights: [] });
      mockRepo.findFolio.mockResolvedValueOnce({ id: "folio-1", status: "OPEN" });
      mockRepo.getContact.mockResolvedValueOnce({ channel: "EMAIL", value: "huesped@example.com" });
      const res = await detailGET(json("GET", "http://localhost/api/reception/reservations/res-1"), idParams());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.contact.value).toBe("huesped@example.com");
    });

    it("PATCH modifica con recálculo (D-43)", async () => {
      mockRepo.modifyReservation.mockResolvedValueOnce({ ...reservation, checkOutDate: "2026-10-04" });
      const res = await modifyPATCH(
        json("PATCH", "http://localhost/api/reception/reservations/res-1", { checkOutDate: "2026-10-04" }),
        idParams(),
      );
      expect(res.status).toBe(200);
      expect(mockRepo.modifyReservation).toHaveBeenCalledWith("res-1", expect.objectContaining({ checkOutDate: "2026-10-04" }), "admin@hotel.es");
    });

    it("PATCH devuelve 409 si no se puede modificar en su estado", async () => {
      mockRepo.modifyReservation.mockResolvedValueOnce(null);
      const res = await modifyPATCH(json("PATCH", "http://localhost/api/reception/reservations/res-1", {}), idParams());
      expect(res.status).toBe(409);
    });

    it("DELETE cancela y libera inventario (D-40)", async () => {
      mockRepo.cancelReservation.mockResolvedValueOnce({ ...reservation, status: "CANCELLED" });
      const res = await cancelDELETE(
        json("DELETE", "http://localhost/api/reception/reservations/res-1", { reason: "Avisó el huésped" }),
        idParams(),
      );
      expect(res.status).toBe(200);
      expect(mockRepo.cancelReservation).toHaveBeenCalledWith("res-1", "admin@hotel.es", "Avisó el huésped");
    });
  });

  describe("confirmación y anticipo (D-39/D-60)", () => {
    it("confirmar no emite token, solo cambia el estado", async () => {
      mockRepo.confirmReservation.mockResolvedValueOnce({ ...reservation, status: "CONFIRMED" });
      const res = await confirmPOST(json("POST", "http://localhost/api/reception/reservations/res-1/confirm"), idParams());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reservation.status).toBe("CONFIRMED");
    });

    it("registra el anticipo cobrado off-chain", async () => {
      mockRepo.recordDeposit.mockResolvedValueOnce({ ...reservation, depositPaidCents: 6000 });
      const res = await depositPOST(
        json("POST", "http://localhost/api/reception/reservations/res-1/deposit", { amountCents: 6000 }),
        idParams(),
      );
      expect(res.status).toBe(200);
      expect(mockRepo.recordDeposit).toHaveBeenCalledWith("res-1", 6000);
    });

    it("rechaza un anticipo no positivo", async () => {
      const res = await depositPOST(
        json("POST", "http://localhost/api/reception/reservations/res-1/deposit", { amountCents: 0 }),
        idParams(),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("liquidación al 100 % (D-57)", () => {
    it("devuelve el plan listo cuando todas las noches tienen token asignado", async () => {
      mockRepo.planSettlement.mockResolvedValueOnce({
        reservationId: "res-1",
        assigned: [{ nightDate: "2026-10-01", tokenId: "tok-1" }],
        needsMint: [],
        conflicts: [],
      });
      const res = await settlePOST(
        json("POST", "http://localhost/api/reception/reservations/res-1/settle"),
        idParams(),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ready).toBe(true);
    });

    it("deja listo=false si hay noches por acuñar", async () => {
      mockRepo.planSettlement.mockResolvedValueOnce({
        reservationId: "res-1",
        assigned: [],
        needsMint: ["2026-10-01"],
        conflicts: [],
      });
      const res = await settlePOST(
        json("POST", "http://localhost/api/reception/reservations/res-1/settle"),
        idParams(),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).ready).toBe(false);
    });

    it("devuelve 409 si una noche ya está vendida a otra persona", async () => {
      mockRepo.planSettlement.mockResolvedValueOnce({
        reservationId: "res-1",
        assigned: [],
        needsMint: [],
        conflicts: ["2026-10-02"],
      });
      const res = await settlePOST(
        json("POST", "http://localhost/api/reception/reservations/res-1/settle"),
        idParams(),
      );
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("SETTLEMENT_CONFLICT");
    });
  });
});
