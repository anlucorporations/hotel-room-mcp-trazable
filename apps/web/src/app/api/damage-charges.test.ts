import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockDamage, mockReservations, mockQueue } = vi.hoisted(() => ({
  mockDamage: {
    createChargeWithNotification: vi.fn(),
    listNotifications: vi.fn(),
    findNotification: vi.fn(),
    markSent: vi.fn(),
    claimNotification: vi.fn(),
    acknowledgeNotification: vi.fn(),
    resolveNotification: vi.fn(),
    expireOverdueNotifications: vi.fn(),
    settleAcceptedChargesForToken: vi.fn(),
  },
  mockReservations: { findReservationIdByToken: vi.fn(), getContact: vi.fn() },
  mockQueue: { enqueueNotification: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    DamageChargesRepository: vi.fn(() => mockDamage),
    ReservationsRepository: vi.fn(() => mockReservations),
    NotificationQueueService: vi.fn(() => mockQueue),
  };
});

import { GET as hkGet, POST as hkPost } from "./housekeeping/damage-charges/route";
import { GET as publicGet, POST as publicPost } from "./public/damage-charges/[id]/route";
import { GET as recGet, PATCH as recPatch } from "./reception/damage-charges/route";

const VIEW = {
  id: "n-1", status: "SENT", channel: "EMAIL", dueDate: new Date(Date.now() + 86_400_000),
  concept: "Daños", amountCents: 4500, currency: "EUR", damageDescription: "Mesa rayada",
  roomNumber: 201, evidencePath: "evidencia.jpg", disputedAt: null, resolvedAt: null,
  chargeStatus: "PENDING", damageChargeId: "dc-1", sentAt: null, disputeNotes: null,
  resolvedBy: null, roomId: "room-1", tokenId: "20120261116", reportedBy: "ama", createdAt: new Date(),
};
const json = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("API cargos por daños (F7)", () => {
  beforeEach(() => { vi.clearAllMocks(); resetGuardState(); });

  it("el alta deja signatureId null y notificación con enlace (D-C27)", async () => {
    mockDamage.createChargeWithNotification.mockResolvedValue({ damageCharge: { id: "dc-1", signatureId: null }, notification: VIEW });
    mockDamage.markSent.mockResolvedValue({ ...VIEW, status: "SENT" });
    mockReservations.findReservationIdByToken.mockResolvedValue(null);
    const res = await hkPost(json("http://localhost/api/housekeeping/damage-charges", {
      roomId: "room-1", tokenId: "20120261116", damageDescription: "Mesa rayada", amountCents: 4500,
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.signatureId).toBeNull();
    expect(data.claimUrl).toBe("/mis-noches/cargos/n-1");
    expect(lastRequiredRole()).toEqual(["HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  });

  it("rechaza importes no enteros o no positivos", async () => {
    const res = await hkPost(json("http://localhost/api/housekeeping/damage-charges", {
      roomId: "room-1", tokenId: "t", damageDescription: "x", amountCents: 0,
    }));
    expect(res.status).toBe(400);
  });

  it("el portal público devuelve el aviso y permite reclamar/aceptar", async () => {
    mockDamage.expireOverdueNotifications.mockResolvedValue(0);
    mockDamage.findNotification.mockResolvedValue(VIEW);
    const get = await publicGet(new NextRequest("http://localhost/api/public/damage-charges/n-1"), { params: Promise.resolve({ id: "n-1" }) });
    expect(get.status).toBe(200);
    expect((await get.json()).claimable).toBe(true);

    mockDamage.claimNotification.mockResolvedValue({ ...VIEW, status: "DISPUTED" });
    const post = await publicPost(json("http://localhost/api/public/damage-charges/n-1", { action: "claim", notes: "no fui yo" }), { params: Promise.resolve({ id: "n-1" }) });
    expect(post.status).toBe(200);
    expect((await post.json()).status).toBe("DISPUTED");
    expect(lastRequiredRole()).toBeUndefined(); // endpoint público (sin guard)
  });

  it("recepción resuelve aceptando o rechazando", async () => {
    mockDamage.expireOverdueNotifications.mockResolvedValue(0);
    mockDamage.listNotifications.mockResolvedValue([VIEW]);
    await recGet(new NextRequest("http://localhost/api/reception/damage-charges"));
    expect(lastRequiredRole()).toEqual(["RECEPTION_ROLE", "DEFAULT_ADMIN_ROLE"]);

    mockDamage.resolveNotification.mockResolvedValue({ notification: { ...VIEW, status: "RESOLVED_ACCEPTED" }, chargeStatus: "PENDING" });
    const res = await recPatch(json("http://localhost/api/reception/damage-charges", { notificationId: "n-1", accepted: true }, "PATCH"));
    expect(res.status).toBe(200);
    expect((await res.json()).chargeStatus).toBe("PENDING");
  });

  it("el listado de la suite exige rol de limpieza", async () => {
    mockDamage.listNotifications.mockResolvedValue([VIEW]);
    const res = await hkGet(new NextRequest("http://localhost/api/housekeeping/damage-charges?tokenId=t"));
    expect(res.status).toBe(200);
    expect(lastRequiredRole()).toEqual(["HEAD_KEEPER", "HOUSEKEEPER", "HOUSEKEEPING", "DEFAULT_ADMIN_ROLE"]);
  });
});
