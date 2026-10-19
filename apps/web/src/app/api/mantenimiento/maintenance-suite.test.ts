import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockAssertSignature } = vi.hoisted(() => ({
  mockRepo: {
    listPlans: vi.fn(),
    listTasks: vi.fn(),
    listDueTasks: vi.fn(),
    findTask: vi.fn(),
    completeTask: vi.fn(),
    skipTask: vi.fn(),
    listAreas: vi.fn(),
    listAreaTasks: vi.fn(),
    listAreaLogs: vi.fn(),
    registerAreaLog: vi.fn(),
    verifyAreaLog: vi.fn(),
    listIncidents: vi.fn(),
  },
  mockAssertSignature: vi.fn(),
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, MaintenanceRepository: vi.fn(() => mockRepo) };
});

vi.mock("@/lib/mantenimiento/signatures", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, assertSignatureAuthorizes: mockAssertSignature };
});

import { GET as preventiveGet, POST as preventivePost } from "./preventivo/route";
import {
  GET as areasGet,
  POST as areasPost,
  PATCH as areasPatch,
} from "./areas-comunes/route";
import { GET as reportsGet } from "./informes/route";

const TASK_UUID = "f3fd2627-381e-4d1d-950d-fa0f940b9eac";
const SIGNATURE_UUID = "6f6d5f0e-4a2b-4e0b-8c3d-2c2d6f9d1a11";
const LOG_UUID = "c03d0ba4-d7e1-4102-beb0-5c3ec3413608";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const task = (overrides: Record<string, unknown> = {}) => ({
  id: TASK_UUID,
  planId: "plan-1",
  dueDate: "2026-10-19",
  status: "PENDING",
  completedBy: null,
  completedAt: null,
  notes: null,
  planCode: "POOL",
  planName: "Filtro de piscina",
  equipment: "Bomba",
  periodicity: "WEEKLY",
  roomNumber: null,
  overdue: true,
  areaId: "area-1",
  areaName: "Piscina",
  isCritical: true,
  requiresSignature: true,
  signatureId: null,
  evidencePath: null,
  ...overrides,
});

describe("API Preventivo (F4 · T4.4/T4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("GET exige rol de la suite y devuelve planes y tareas", async () => {
    mockRepo.listPlans.mockResolvedValue([{ id: "plan-1" }]);
    mockRepo.listTasks.mockResolvedValue([task()]);
    const res = await preventiveGet(new NextRequest("http://localhost/api/mantenimiento/preventivo"));
    expect(res.status).toBe(200);
    expect(lastRequiredRole()).toEqual(["HEAD_MAINTENANCE", "MAINTENANCE_TECH", "MAINTENANCE"]);
    const data = await res.json();
    expect(data.tasks).toHaveLength(1);
  });

  it("una tarea de área crítica SIN firma se rechaza con 409 SIGNATURE_REQUIRED", async () => {
    mockRepo.findTask.mockResolvedValue(task());
    const res = await preventivePost(
      jsonRequest("http://localhost/api/mantenimiento/preventivo", { taskId: TASK_UUID, action: "complete" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SIGNATURE_REQUIRED");
    expect(mockRepo.completeTask).not.toHaveBeenCalled();
  });

  it("una tarea crítica CON firma válida se cierra y la firma se enlaza", async () => {
    mockRepo.findTask.mockResolvedValue(task());
    mockAssertSignature.mockResolvedValue({ id: SIGNATURE_UUID });
    mockRepo.completeTask.mockResolvedValue({ task: task({ status: "DONE" }), next: null });
    const res = await preventivePost(
      jsonRequest("http://localhost/api/mantenimiento/preventivo", {
        taskId: TASK_UUID,
        action: "complete",
        signatureId: SIGNATURE_UUID,
        evidencePath: "evidencias/foto.jpg",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockAssertSignature).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PREVENTIVE_TASK", entityUuid: TASK_UUID }),
    );
    expect(mockRepo.completeTask).toHaveBeenCalledWith(
      TASK_UUID,
      "admin@hotel.es",
      null,
      { signatureId: SIGNATURE_UUID, evidencePath: "evidencias/foto.jpg" },
    );
  });

  it("una tarea NO crítica se cierra sin firma", async () => {
    mockRepo.findTask.mockResolvedValue(task({ isCritical: false, requiresSignature: false }));
    mockRepo.completeTask.mockResolvedValue({ task: task({ status: "DONE" }), next: null });
    const res = await preventivePost(
      jsonRequest("http://localhost/api/mantenimiento/preventivo", { taskId: TASK_UUID, action: "complete" }),
    );
    expect(res.status).toBe(200);
    expect(mockAssertSignature).not.toHaveBeenCalled();
  });

  it("rechaza un taskId que no es UUID", async () => {
    const res = await preventivePost(
      jsonRequest("http://localhost/api/mantenimiento/preventivo", { taskId: "no-uuid", action: "complete" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("API Áreas comunes (F4 · T4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("GET devuelve las áreas con sus tareas y los registros pendientes", async () => {
    mockRepo.listAreas.mockResolvedValue([
      { id: "area-1", areaTypeCode: "POOL", areaTypeName: "Piscina", isCritical: true, name: "Piscina", locationNotes: null, isActive: true },
    ]);
    mockRepo.listAreaTasks.mockResolvedValue([{ id: "task-1", label: "Limpiar filtro" }]);
    mockRepo.listAreaLogs.mockResolvedValue([{ id: LOG_UUID }]);
    const res = await areasGet(new NextRequest("http://localhost/api/mantenimiento/areas-comunes"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.areas[0].tasks).toHaveLength(1);
    expect(data.pendingLogs).toHaveLength(1);
  });

  it("POST registra la ejecución con el usuario de la sesión", async () => {
    mockRepo.registerAreaLog.mockResolvedValue({ id: LOG_UUID });
    const res = await areasPost(
      jsonRequest("http://localhost/api/mantenimiento/areas-comunes", {
        action: "log",
        taskId: LOG_UUID,
        notes: "hecho",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockRepo.registerAreaLog).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: LOG_UUID, performedBy: "admin@hotel.es", notes: "hecho" }),
    );
  });

  it("PATCH verifica un registro pendiente", async () => {
    mockRepo.verifyAreaLog.mockResolvedValue({ id: LOG_UUID, verifiedAt: new Date() });
    const res = await areasPatch(
      jsonRequest("http://localhost/api/mantenimiento/areas-comunes", { action: "verify", logId: LOG_UUID }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(mockRepo.verifyAreaLog).toHaveBeenCalledWith(LOG_UUID, {
      verifiedBy: "admin@hotel.es",
      signatureId: null,
    });
  });

  it("PATCH exige jefe u owner (rol de verificación)", async () => {
    mockRepo.verifyAreaLog.mockResolvedValue({ id: LOG_UUID });
    await areasPatch(
      jsonRequest("http://localhost/api/mantenimiento/areas-comunes", { action: "verify", logId: LOG_UUID }, "PATCH"),
    );
    expect(lastRequiredRole()).toEqual(["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
  });
});

describe("API Informes (F4 · T4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("agrega incidencias, preventivo y áreas por estado", async () => {
    mockRepo.listIncidents.mockResolvedValue([
      { status: "OPEN", kind: "FONTANERIA", priority: "HIGH", assignedTo: "tecnico1", reportedBy: "recepcion", blocksSale: true, createdAt: new Date() },
      { status: "RESOLVED", kind: "FONTANERIA", priority: "LOW", assignedTo: null, reportedBy: "recepcion", blocksSale: false, createdAt: new Date() },
    ]);
    mockRepo.listTasks.mockResolvedValue([{ status: "PENDING", isCritical: true, signatureId: null, completedAt: null, dueDate: "2026-10-20" }]);
    mockRepo.listAreaLogs.mockResolvedValue([
      { performedBy: "tecnico1", verifiedAt: null, areaName: "Piscina", performedAt: new Date() },
    ]);
    const res = await reportsGet(new NextRequest("http://localhost/api/mantenimiento/informes"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.incidents.total).toBe(2);
    expect(data.incidents.byStatus.OPEN).toBe(1);
    expect(data.incidents.blockingOpen).toBe(1);
    expect(data.preventive.criticalPending).toBe(1);
    expect(data.areas.pendingVerification).toBe(1);
    expect(data.technicians).toContain("tecnico1");
  });
});
