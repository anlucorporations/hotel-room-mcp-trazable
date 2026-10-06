import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

/**
 * `ReceptionError` REAL: el mapeo código→HTTP es el de producción. Solo se sustituye el repositorio.
 */
const { ReceptionError } = await vi.importActual<typeof SharedModule>("@hotel/shared");

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    ensureRecoveryCodes: vi.fn(),
    listNightsByDate: vi.fn(),
    getOperationalStatusByRoom: vi.fn(),
    findByRecoveryCode: vi.fn(),
    listCharges: vi.fn(),
    createCharge: vi.fn(),
    createCheckout: vi.fn(),
    releaseRoom: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, ReceptionRepository: vi.fn().mockImplementation(() => mockRepo) };
});

import { GET as getOverview } from "./overview/route";
import { GET as getLookup } from "./reservations/lookup/route";
import { GET as getCharges, POST as postCharge } from "./charges/route";
import { POST as postCheckout } from "./checkout/route";

const request = (url: string, body?: unknown, method = "GET"): NextRequest =>
  new NextRequest(`http://localhost:3000${url}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe("Recepción v2 · API (CU-31..CU-35)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockRepo.ensureRecoveryCodes.mockResolvedValue(0);
    mockRepo.listNightsByDate.mockResolvedValue([]);
    mockRepo.getOperationalStatusByRoom.mockResolvedValue(new Map());
    mockRepo.listCharges.mockResolvedValue([]);
  });

  describe("autorización (RNF-31, D-37)", () => {
    it("overview responde 401 sin sesión y exige RECEPTION_ROLE", async () => {
      setGuardState("unauthorized");
      const res = await getOverview(request("/api/reception/overview"));
      expect(res.status).toBe(401);

      resetGuardState();
      await getOverview(request("/api/reception/overview"));
      expect(lastRequiredRole()).toBe("RECEPTION_ROLE");
    });

    it("checkout responde 403 con rol insuficiente", async () => {
      setGuardState("forbidden");
      const res = await postCheckout(
        request("/api/reception/checkout", { tokenId: "t1", roomCondition: "OK" }, "POST"),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/reception/overview", () => {
    it("rechaza una fecha con formato inválido", async () => {
      const res = await getOverview(request("/api/reception/overview?date=15-09-2026"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("FECHA_INVALIDA");
    });

    it("devuelve las 50 habitaciones y las reservas del día", async () => {
      mockRepo.listNightsByDate.mockResolvedValue([
        {
          tokenId: "10120260915",
          roomNumber: 101,
          roomType: "SIMPLE",
          checkInDate: "2026-09-15",
          status: "SOLD",
          currentOwner: "0x1111111111111111111111111111111111111111",
          recoveryCode: "MDS-AB12CD34",
          checkedInAt: null,
        },
        {
          tokenId: "11620260915",
          roomNumber: 116,
          roomType: "DOBLE",
          checkInDate: "2026-09-15",
          status: "CHECKED_IN",
          currentOwner: "0x2222222222222222222222222222222222222222",
          recoveryCode: "MDS-EF34GH56",
          checkedInAt: new Date(),
        },
      ]);

      const res = await getOverview(request("/api/reception/overview?date=2026-09-15"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rooms).toHaveLength(50);
      expect(data.reservations).toHaveLength(2);
      expect(data.stats.reserved).toBe(1);
      expect(data.stats.occupied).toBe(1);
    });
  });

  describe("GET /api/reception/reservations/lookup", () => {
    it("rechaza un código con formato inválido sin consultar la base", async () => {
      const res = await getLookup(request("/api/reception/reservations/lookup?code=ABCD"));
      expect(res.status).toBe(400);
      expect(mockRepo.findByRecoveryCode).not.toHaveBeenCalled();
    });

    it("responde 404 si no hay reserva con ese código", async () => {
      mockRepo.findByRecoveryCode.mockResolvedValue(null);
      const res = await getLookup(request("/api/reception/reservations/lookup?code=MDS-AB12CD34"));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("RESERVA_NO_ENCONTRADA");
    });

    it("normaliza el código y devuelve la reserva", async () => {
      mockRepo.findByRecoveryCode.mockResolvedValue({
        tokenId: "10120260915",
        roomNumber: 101,
        roomType: "SIMPLE",
        checkInDate: "2026-09-15",
        status: "SOLD",
        currentOwner: "0x1111111111111111111111111111111111111111",
        recoveryCode: "MDS-AB12CD34",
        checkedInAt: null,
      });

      const res = await getLookup(request("/api/reception/reservations/lookup?code=mds-ab12cd34"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reservation.roomNumber).toBe(101);
      expect(mockRepo.findByRecoveryCode).toHaveBeenCalledWith("MDS-AB12CD34");
    });
  });

  describe("GET/POST /api/reception/charges", () => {
    it("GET sin tokenId responde 400", async () => {
      const res = await getCharges(request("/api/reception/charges"));
      expect(res.status).toBe(400);
    });

    it("POST con importe no entero responde 400", async () => {
      const res = await postCharge(
        request("/api/reception/charges", { tokenId: "t1", concept: "Minibar", amountCents: 1.5 }, "POST"),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("CARGO_INVALIDO");
    });

    it("POST correcto responde 201 con el cargo", async () => {
      mockRepo.createCharge.mockResolvedValue({
        id: "c1",
        tokenId: "t1",
        concept: "Minibar",
        amountCents: 1250,
        currency: "EUR",
        status: "PENDING",
        createdBy: "admin@hotel.es",
        createdAt: new Date(),
        cancelledBy: null,
        cancelledAt: null,
        cancelReason: null,
      });

      const res = await postCharge(
        request("/api/reception/charges", { tokenId: "t1", concept: "Minibar", amountCents: 1250 }, "POST"),
      );
      expect(res.status).toBe(201);
      expect((await res.json()).charge.id).toBe("c1");
      expect(mockRepo.createCharge).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: "admin@hotel.es" }),
      );
    });
  });

  describe("POST /api/reception/checkout", () => {
    it("rechaza una condición de habitación no admitida", async () => {
      const res = await postCheckout(
        request("/api/reception/checkout", { tokenId: "t1", roomCondition: "MAL" }, "POST"),
      );
      expect(res.status).toBe(400);
    });

    it("mapea ESTANCIA_NO_CHECKED_IN a 409", async () => {
      mockRepo.createCheckout.mockRejectedValue(
        new ReceptionError("ESTANCIA_NO_CHECKED_IN", "sin entrada"),
      );
      const res = await postCheckout(
        request("/api/reception/checkout", { tokenId: "t1", roomCondition: "OK" }, "POST"),
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("ESTANCIA_NO_CHECKED_IN");
    });

    it("registra el check-out y devuelve el recibo", async () => {
      mockRepo.createCheckout.mockResolvedValue({
        created: true,
        checkout: {
          id: "co1",
          tokenId: "t1",
          roomNumber: 101,
          checkInDate: "2026-09-15",
          roomCondition: "OK",
          notes: null,
          chargesCancelled: 2,
          processedBy: "admin@hotel.es",
          createdAt: new Date(),
          incidents: [],
        },
      });

      const res = await postCheckout(
        request(
          "/api/reception/checkout",
          { tokenId: "t1", roomCondition: "OK", cancelChargeIds: ["c1", "c2"] },
          "POST",
        ),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.created).toBe(true);
      expect(data.checkout.chargesCancelled).toBe(2);
      expect(mockRepo.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ processedBy: "admin@hotel.es", cancelChargeIds: ["c1", "c2"] }),
      );
    });
  });
});
