import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import { MaintenanceError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockRooms } = vi.hoisted(() => ({
  mockRepo: {
    listIncidents: vi.fn(),
    reportIncident: vi.fn(),
    assignIncident: vi.fn(),
    resolveIncident: vi.fn(),
    cancelIncident: vi.fn(),
    listDueTasks: vi.fn(),
    listTasks: vi.fn(),
    completeTask: vi.fn(),
    skipTask: vi.fn(),
    getBoard: vi.fn(),
    createPlan: vi.fn(),
    listPlans: vi.fn(),
    setPlanActive: vi.fn(),
  },
  mockRooms: { listRooms: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    MaintenanceRepository: vi.fn(() => mockRepo),
    RoomsRepository: vi.fn(() => mockRooms),
  };
});

import { GET as incidentsGet, POST as incidentsPost } from "./incidents/route";
import { PATCH as incidentPatch } from "./incidents/[id]/route";
import { GET as tasksGet } from "./tasks/route";
import { PATCH as taskPatch } from "./tasks/[id]/route";
import { GET as boardGet } from "./board/route";
import { GET as roomsGet } from "./rooms/route";
import { GET as adminIncidentsGet } from "../admin/mantenimiento/incidents/route";
import { GET as plansGet, POST as plansPost } from "../admin/mantenimiento/plans/route";
import { PATCH as planPatch } from "../admin/mantenimiento/plans/[id]/route";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("API de Mantenimiento (F4 · D-52…D-54, D-63)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("las rutas del técnico exigen MAINTENANCE", async () => {
    mockRepo.listIncidents.mockResolvedValue([]);
    await incidentsGet(new NextRequest("http://localhost/api/mantenimiento/incidents"));
    expect(lastRequiredRole()).toBe("MAINTENANCE");

    mockRepo.getBoard.mockResolvedValue({ date: "2026-09-27", incidents: [], dueTasks: [], blockedRoomIds: [], generatedAt: "" });
    await boardGet(new NextRequest("http://localhost/api/mantenimiento/board"));
    expect(lastRequiredRole()).toBe("MAINTENANCE");
  });

  it("reportar una avería admite recepción, limpieza y técnico (D-52)", async () => {
    mockRepo.reportIncident.mockResolvedValueOnce({ id: "inc-1", status: "OPEN" });
    const res = await incidentsPost(
      jsonRequest("http://localhost/api/mantenimiento/incidents", { roomId: "room-1", kind: "FONTANERIA" }),
    );
    expect(res.status).toBe(201);
    expect(lastRequiredRole()).toEqual(["RECEPTION_ROLE", "HOUSEKEEPING", "MAINTENANCE"]);
    expect(mockRepo.reportIncident).toHaveBeenCalledWith(expect.objectContaining({ blocksSale: true, reportedBy: "admin@hotel.es" }));
  });

  it("rechaza un tipo de avería fuera del vocabulario", async () => {
    const res = await incidentsPost(
      jsonRequest("http://localhost/api/mantenimiento/incidents", { roomId: "room-1", kind: "MAGIA" }),
    );
    expect(res.status).toBe(400);
  });

  it("resolver una incidencia la cierra y libera la venta (D-53)", async () => {
    mockRepo.resolveIncident.mockResolvedValueOnce({ id: "inc-1", status: "RESOLVED", blocksSale: true });
    const res = await incidentPatch(
      jsonRequest("http://localhost/api/mantenimiento/incidents/inc-1", { action: "resolve" }, "PATCH"),
      { params: Promise.resolve({ id: "inc-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockRepo.resolveIncident).toHaveBeenCalledWith("inc-1", "admin@hotel.es", null);

    mockRepo.resolveIncident.mockRejectedValueOnce(new MaintenanceError("INCIDENT_CLOSED", "cerrada"));
    const closed = await incidentPatch(
      jsonRequest("http://localhost/api/mantenimiento/incidents/inc-1", { action: "resolve" }, "PATCH"),
      { params: Promise.resolve({ id: "inc-1" }) },
    );
    expect(closed.status).toBe(409);
  });

  it("lista las tareas preventivas vencidas (aviso, D-54)", async () => {
    mockRepo.listDueTasks.mockResolvedValueOnce([{ id: "task-1" }]);
    const res = await tasksGet(new NextRequest("http://localhost/api/mantenimiento/tasks?due=2026-09-27"));
    expect(res.status).toBe(200);
    expect(mockRepo.listDueTasks).toHaveBeenCalledWith("2026-09-27");
    const data = await res.json();
    expect(data.due).toBe(true);

    const bad = await tasksGet(new NextRequest("http://localhost/api/mantenimiento/tasks?due=2026-13-01"));
    expect(bad.status).toBe(400);
  });

  it("cerrar una tarea programa la siguiente (D-54)", async () => {
    mockRepo.completeTask.mockResolvedValueOnce({ task: { id: "task-1", status: "DONE" }, next: { id: "task-2" } });
    const res = await taskPatch(
      jsonRequest("http://localhost/api/mantenimiento/tasks/task-1", { action: "complete" }, "PATCH"),
      { params: Promise.resolve({ id: "task-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockRepo.completeTask).toHaveBeenCalledWith("task-1", "admin@hotel.es", null);
  });

  it("ofrece las habitaciones para reportar (D-52)", async () => {
    mockRooms.listRooms.mockResolvedValueOnce([
      { id: "r1", roomNumber: 101, roomType: "DOBLE", publicationStatus: "PUBLISHED" },
      { id: "r2", roomNumber: 102, roomType: "SIMPLE", publicationStatus: "OUT_OF_SERVICE" },
    ]);
    const res = await roomsGet(new NextRequest("http://localhost/api/mantenimiento/rooms"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rooms).toEqual([{ id: "r1", roomNumber: 101, roomType: "DOBLE" }]);
  });

  it("la supervisión de incidencias y los planes son solo del owner", async () => {
    mockRepo.listIncidents.mockResolvedValueOnce([]);
    await adminIncidentsGet(new NextRequest("http://localhost/api/admin/mantenimiento/incidents"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");

    mockRepo.listPlans.mockResolvedValueOnce([]);
    await plansGet(new NextRequest("http://localhost/api/admin/mantenimiento/plans"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("crea un plan preventivo y valida su entrada", async () => {
    mockRepo.createPlan.mockResolvedValueOnce({ id: "plan-1", code: "CAL-01" });
    const ok = await plansPost(
      jsonRequest("http://localhost/api/admin/mantenimiento/plans", {
        code: "cal-01",
        name: "Caldera",
        equipment: "Caldera",
        periodicity: "MONTHLY",
        firstDueDate: "2026-10-01",
      }),
    );
    expect(ok.status).toBe(201);
    expect(mockRepo.createPlan).toHaveBeenCalledWith(expect.objectContaining({ code: "CAL-01", periodicity: "MONTHLY" }));

    const bad = await plansPost(
      jsonRequest("http://localhost/api/admin/mantenimiento/plans", { code: "X", periodicity: "ANUAL", firstDueDate: "ayer" }),
    );
    expect(bad.status).toBe(400);
  });

  it("activa o pausa un plan preventivo", async () => {
    mockRepo.setPlanActive.mockResolvedValueOnce({ id: "plan-1", active: false });
    const res = await planPatch(
      jsonRequest("http://localhost/api/admin/mantenimiento/plans/plan-1", { active: false }, "PATCH"),
      { params: Promise.resolve({ id: "plan-1" }) },
    );
    expect(res.status).toBe(200);

    mockRepo.setPlanActive.mockResolvedValueOnce(null);
    const missing = await planPatch(
      jsonRequest("http://localhost/api/admin/mantenimiento/plans/plan-1", { active: true }, "PATCH"),
      { params: Promise.resolve({ id: "plan-1" }) },
    );
    expect(missing.status).toBe(404);
  });
});
