import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../test/guard-mock";
import { HousekeepingError, type HousekeepingBoard } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockNotify } = vi.hoisted(() => ({
  mockRepo: {
    listShifts: vi.fn(),
    createShift: vi.fn(),
    listAssignments: vi.fn(),
    listAssignmentsByDate: vi.fn(),
    autoAssign: vi.fn(),
    assignRoom: vi.fn(),
    unassignRoom: vi.fn(),
    startAssignment: vi.fn(),
    completeAssignment: vi.fn(),
    listRoomsToClean: vi.fn(),
    setRoomOperationalStatus: vi.fn(),
    listSupplyItems: vi.fn(),
    listLowStock: vi.fn(),
    getBoard: vi.fn(),
    restock: vi.fn(),
    consumeSupplies: vi.fn(),
  },
  mockNotify: vi.fn(async () => ({ sent: true })),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, HousekeepingRepository: vi.fn(() => mockRepo) };
});

vi.mock("@/lib/low-stock", () => ({ notifyLowStock: mockNotify }));

import { GET as shiftsGet, POST as shiftsPost } from "./shifts/route";
import { POST as assignmentsPost } from "./assignments/route";
import { PATCH as assignmentPatch } from "./assignments/[id]/route";
import { GET as roomsGet } from "./rooms/route";
import { POST as statusPost } from "./rooms/[id]/status/route";
import { GET as streamGet } from "./stream/route";
import { GET as adminSuppliesGet, POST as adminSuppliesPost } from "../admin/housekeeping/supplies/route";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const board: HousekeepingBoard = {
  date: "2026-09-27",
  shifts: [],
  assignments: [],
  lowStock: [],
  generatedAt: "2026-09-27T06:00:00.000Z",
};

describe("API de Housekeeping (F3 · D-30, D-48…D-51, D-62, D-64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("todas las rutas exigen HOUSEKEEPING (el owner también entra)", async () => {
    await shiftsGet(new NextRequest("http://localhost/api/housekeeping/shifts"));
    expect(lastRequiredRole()).toBe("HOUSEKEEPING");

    await streamGet(new NextRequest("http://localhost/api/housekeeping/stream"));
    expect(lastRequiredRole()).toBe("HOUSEKEEPING");

    setGuardState("unauthorized");
    const denied = await shiftsGet(new NextRequest("http://localhost/api/housekeeping/shifts"));
    expect(denied.status).toBe(401);
  });

  it("la lencería de administración es solo para el owner", async () => {
    await adminSuppliesGet(new NextRequest("http://localhost/api/admin/housekeeping/supplies"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("crea un turno y traduce el duplicado a 409", async () => {
    mockRepo.createShift.mockResolvedValueOnce({ id: "s1" });
    const ok = await shiftsPost(
      jsonRequest("http://localhost/api/housekeeping/shifts", { date: "2026-09-27", label: "mañana", supervisor: "Elena" }),
    );
    expect(ok.status).toBe(201);
    expect(mockRepo.createShift).toHaveBeenCalledWith({ shiftDate: "2026-09-27", label: "MANANA", supervisor: "Elena" });

    mockRepo.createShift.mockRejectedValueOnce(new HousekeepingError("SHIFT_EXISTS", "duplicado"));
    const dup = await shiftsPost(jsonRequest("http://localhost/api/housekeeping/shifts", { date: "2026-09-27", label: "MANANA" }));
    expect(dup.status).toBe(409);
  });

  it("rechaza un turno con etiqueta inválida", async () => {
    const res = await shiftsPost(jsonRequest("http://localhost/api/housekeeping/shifts", { date: "2026-09-27", label: "SIESTA" }));
    expect(res.status).toBe(400);
  });

  it("reparte automáticamente entre las camareras (D-48)", async () => {
    mockRepo.autoAssign.mockResolvedValueOnce([{ id: "a1" }]);
    const res = await assignmentsPost(
      jsonRequest("http://localhost/api/housekeeping/assignments", { shiftId: "s1", assignees: ["Marta", "Lucía"] }),
    );
    expect(res.status).toBe(200);
    expect(mockRepo.autoAssign).toHaveBeenCalledWith("s1", ["Marta", "Lucía"]);
  });

  it("asigna a mano una habitación concreta", async () => {
    mockRepo.assignRoom.mockResolvedValueOnce({ id: "a1" });
    const res = await assignmentsPost(
      jsonRequest("http://localhost/api/housekeeping/assignments", { shiftId: "s1", roomId: "r1", assignee: "Marta" }),
    );
    expect(res.status).toBe(201);
    expect(mockRepo.assignRoom).toHaveBeenCalledWith({ shiftId: "s1", roomId: "r1", assignee: "Marta" });
  });

  it("empieza una habitación y devuelve 404 si ya está terminada", async () => {
    mockRepo.startAssignment.mockResolvedValueOnce({ id: "a1", status: "IN_PROGRESS" });
    const ok = await assignmentPatch(jsonRequest("http://localhost/api/housekeeping/assignments/a1", { action: "start" }, "PATCH"), { params: Promise.resolve({ id: "a1" }) });
    expect(ok.status).toBe(200);

    mockRepo.startAssignment.mockResolvedValueOnce(null);
    const missing = await assignmentPatch(jsonRequest("http://localhost/api/housekeeping/assignments/a1", { action: "start" }, "PATCH"), { params: Promise.resolve({ id: "a1" }) });
    expect(missing.status).toBe(404);
  });

  it("al terminar avisa si queda stock bajo (D-64)", async () => {
    mockRepo.completeAssignment.mockResolvedValueOnce({
      assignment: { id: "a1", status: "DONE" },
      roomNumber: 101,
      lowStock: [{ code: "SOAP", stockQty: 1, thresholdQty: 2 }],
    });
    const res = await assignmentPatch(jsonRequest("http://localhost/api/housekeeping/assignments/a1", { action: "complete" }, "PATCH"), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    expect(mockNotify).toHaveBeenCalled();
  });

  it("lista las habitaciones a limpiar con el motivo (D-48)", async () => {
    mockRepo.listRoomsToClean.mockResolvedValueOnce([{ roomId: "r1", reason: "CHECKOUT" }]);
    const res = await roomsGet(new NextRequest("http://localhost/api/housekeeping/rooms?date=2026-09-27"));
    expect(res.status).toBe(200);
    expect(mockRepo.listRoomsToClean).toHaveBeenCalledWith("2026-09-27");

    const bad = await roomsGet(new NextRequest("http://localhost/api/housekeeping/rooms?date=2026-13-01"));
    expect(bad.status).toBe(400);
  });

  it("cambia el estado operativo de una habitación (D-19)", async () => {
    mockRepo.setRoomOperationalStatus.mockResolvedValueOnce({ roomId: "r1", operationalStatus: "DIRTY" });
    const res = await statusPost(jsonRequest("http://localhost/api/housekeeping/rooms/r1/status", { status: "DIRTY" }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.setRoomOperationalStatus).toHaveBeenCalledWith("r1", "DIRTY", "admin@hotel.es", null);

    const bad = await statusPost(jsonRequest("http://localhost/api/housekeeping/rooms/r1/status", { status: "MOJADA" }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(bad.status).toBe(400);
  });

  it("el SSE devuelve un flujo de eventos con el primer tablero (D-30)", async () => {
    mockRepo.getBoard.mockResolvedValue(board);
    const res = await streamGet(new NextRequest("http://localhost/api/housekeeping/stream?date=2026-09-27"));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    expect(text).toContain("event: board");
    await reader?.cancel();
  });

  it("el responsable repone stock desde la lencería", async () => {
    mockRepo.restock.mockResolvedValueOnce({ id: "sup-1", stockQty: 20 });
    const res = await adminSuppliesPost(jsonRequest("http://localhost/api/admin/housekeeping/supplies", { itemId: "sup-1", quantity: 10 }));
    expect(res.status).toBe(200);
    expect(mockRepo.restock).toHaveBeenCalledWith("sup-1", 10, "admin@hotel.es");
  });
});
