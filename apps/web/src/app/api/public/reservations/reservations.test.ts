import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ReservationError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

const { mockRooms, mockReservations, mockSettings, mockRates } = vi.hoisted(() => ({
  mockRooms: { findById: vi.fn(), listRooms: vi.fn() },
  mockReservations: { createReservation: vi.fn(), findById: vi.fn(), planSettlement: vi.fn() },
  mockSettings: { getNumber: vi.fn() },
  mockRates: { getRate: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    RoomsRepository: vi.fn(() => mockRooms),
    ReservationsRepository: vi.fn(() => mockReservations),
    SettingsRepository: vi.fn(() => mockSettings),
    ExchangeRateService: vi.fn(() => mockRates),
  };
});

import { POST as reservePost } from "./route";
import { GET as statusGet } from "./[id]/route";
import { POST as settlePost } from "./[id]/settle/route";

const jsonRequest = (url: string, body: unknown): NextRequest =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const publishedRoom = { id: "room-1", roomNumber: 101, roomType: "DOBLE", publicationStatus: "PUBLISHED", baseRateWei: "1000000000000000000" };

describe("API pública de reservas (F6 · D-65/D-72)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRates.getRate.mockResolvedValue({ rate: 2, updatedAt: "", source: "default", stale: false });
    mockSettings.getNumber.mockImplementation(async (_key: string, fallback: number) => fallback);
    mockRooms.findById.mockResolvedValue(publishedRoom);
    mockReservations.createReservation.mockResolvedValue({
      id: "res-1",
      roomNumber: 101,
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-03",
      status: "PENDING",
      totalCents: 400,
      depositRequiredCents: 120,
      depositPaidCents: 0,
      holdExpiresAt: new Date("2026-10-01T00:00:00Z"),
    });
  });

  it("exige wallet válida (D-72)", async () => {
    const res = await reservePost(
      jsonRequest("http://localhost/api/public/reservations", { roomId: "room-1", checkInDate: "2026-10-01", checkOutDate: "2026-10-03", wallet: "nope" }),
    );
    expect(res.status).toBe(400);
    expect(mockReservations.createReservation).not.toHaveBeenCalled();
  });

  it("retiene la noche y devuelve las instrucciones del anticipo (201)", async () => {
    const res = await reservePost(
      jsonRequest("http://localhost/api/public/reservations", {
        roomId: "room-1",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-03",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        email: "huesped@example.com",
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.payment.amountCents).toBe(120);
    expect(data.payment.reference).toMatch(/^MDS-[0-9A-Z]+$/);
    // Precio: 1 nativo = 2 EUR → 200 céntimos/noche × 2 noches = 400; anticipo 30 % = 120.
    expect(mockReservations.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 400, depositRequiredCents: 120, channel: "WEB", contact: { channel: "EMAIL", value: "huesped@example.com" } }),
    );
  });

  it("si no hay tarifa publicada, no retiene (409)", async () => {
    mockRooms.findById.mockResolvedValueOnce({ ...publishedRoom, baseRateWei: null });
    const res = await reservePost(
      jsonRequest("http://localhost/api/public/reservations", {
        roomId: "room-1",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-02",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("traduce la indisponibilidad del motor a 409", async () => {
    mockReservations.createReservation.mockRejectedValueOnce(new ReservationError("UNAVAILABLE", "ocupada"));
    const res = await reservePost(
      jsonRequest("http://localhost/api/public/reservations", {
        roomId: "room-1",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-02",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("consulta el estado por id sin exponer contacto", async () => {
    mockReservations.findById.mockResolvedValueOnce({
      reservation: { id: "res-1", roomNumber: 101, checkInDate: "2026-10-01", checkOutDate: "2026-10-03", status: "PENDING", totalCents: 400, depositRequiredCents: 120, depositPaidCents: 0, holdExpiresAt: new Date(), confirmedAt: null, cancelledAt: null, contact: "secreto" },
      nights: [{ nightDate: "2026-10-01", tokenId: null }],
    });
    const res = await statusGet(new NextRequest("http://localhost/api/public/reservations/res-1"), { params: Promise.resolve({ id: "res-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nights).toEqual([{ nightDate: "2026-10-01", assigned: false }]);
    expect(JSON.stringify(data)).not.toContain("secreto");
  });

  it("404 si la reserva no existe", async () => {
    mockReservations.findById.mockResolvedValueOnce(null);
    const res = await statusGet(new NextRequest("http://localhost/api/public/reservations/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("concilia la liquidación al 100 % y avisa de conflictos", async () => {
    mockReservations.planSettlement.mockResolvedValueOnce({ reservationId: "res-1", assigned: [{ nightDate: "2026-10-01", tokenId: "t1" }], needsMint: ["2026-10-02"], conflicts: [] });
    const ok = await settlePost(new NextRequest("http://localhost/api/public/reservations/res-1/settle", { method: "POST" }), { params: Promise.resolve({ id: "res-1" }) });
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.plan.assigned).toHaveLength(1);

    mockReservations.planSettlement.mockResolvedValueOnce({ reservationId: "res-1", assigned: [], needsMint: [], conflicts: ["2026-10-02"] });
    const conflict = await settlePost(new NextRequest("http://localhost/api/public/reservations/res-1/settle", { method: "POST" }), { params: Promise.resolve({ id: "res-1" }) });
    expect(conflict.status).toBe(409);
  });
});
