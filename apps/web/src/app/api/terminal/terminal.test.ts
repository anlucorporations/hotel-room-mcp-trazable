import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type * as SharedModule from "@hotel/shared";

const { mockAuth, mockSession, mockRepo } = vi.hoisted(() => ({
  mockAuth: { authenticateTerminalPin: vi.fn(), changeTerminalPin: vi.fn() },
  mockSession: {
    readTerminalSession: vi.fn(),
    signTerminalToken: vi.fn(async () => "token-de-prueba"),
    terminalCookieOptions: vi.fn(() => ({ path: "/" })),
    TERMINAL_TOKEN_COOKIE: "hotel_terminal_token",
  },
  mockRepo: {
    listTerminalTasks: vi.fn(),
    listIncidents: vi.fn(),
    findTask: vi.fn(),
    completeTask: vi.fn(),
    reportIncident: vi.fn(),
    resolveIncident: vi.fn(),
    assignIncident: vi.fn(),
  },
}));

vi.mock("@/lib/terminal-auth", () => mockAuth);
vi.mock("@/lib/terminal-session", () => mockSession);
vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    MaintenanceRepository: vi.fn(() => mockRepo),
    RoomsRepository: vi.fn(() => ({ listRooms: async () => [{ id: "room-1", roomNumber: 101 }] })),
    TerminalOperatorsError: actual.TerminalOperatorsError,
  };
});

import { POST as login } from "./auth/route";
import { GET as tasks, PATCH as patchTask } from "./tasks/route";

const SESSION = {
  ok: true as const,
  session: {
    kind: "terminal" as const,
    operatorId: "op-1",
    username: "tecnico1",
    fullName: "Técnico Uno",
    role: "MAINTENANCE_TECH" as const,
    startedAt: new Date().toISOString(),
  },
  refreshedToken: "renovado",
};

function json(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/terminal/x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("API del terminal (F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.readTerminalSession.mockResolvedValue(SESSION);
  });

  it("login: 401 con PIN inválido y 200 con cookie y mustChangePin", async () => {
    mockAuth.authenticateTerminalPin.mockResolvedValueOnce({
      ok: false, reason: "invalid_pin", message: "Operario o PIN no válidos.",
    });
    const bad = await login(json({ username: "tecnico1", pin: "1234" }));
    expect(bad.status).toBe(401);

    mockAuth.authenticateTerminalPin.mockResolvedValueOnce({
      ok: true,
      session: SESSION.session,
      operator: { id: "op-1", username: "tecnico1", fullName: "Técnico Uno", role: "MAINTENANCE_TECH" },
      mustChangePin: true,
      pinExpired: false,
    });
    const good = await login(json({ username: "tecnico1", pin: "5871" }));
    expect(good.status).toBe(200);
    expect((await good.json()).mustChangePin).toBe(true);
    expect(good.cookies.get("hotel_terminal_token")?.value).toBe("token-de-prueba");
  });

  it("login: 423 cuando el terminal está bloqueado por intentos", async () => {
    mockAuth.authenticateTerminalPin.mockResolvedValueOnce({
      ok: false, reason: "locked", message: "Bloqueado.", retryAfterSeconds: 900,
    });
    const response = await login(json({ username: "tecnico1", pin: "0000" }));
    expect(response.status).toBe(423);
  });

  it("tareas: solo devuelve incidencias y tareas asignadas, sin importes", async () => {
    mockRepo.listTerminalTasks.mockResolvedValue({
      incidents: [{ id: "inc-1", kind: "FONTANERIA", description: "Fuga", priority: "HIGH", status: "OPEN", blocksSale: true, assignedTo: "tecnico1", roomNumber: 101, createdAt: new Date() }],
      tasks: [{ id: "task-1", dueDate: "2026-10-19", status: "PENDING", overdue: false, planName: "Revisión", equipment: null, roomNumber: null, areaName: null, requiresSignature: false, assignedTo: "tecnico1", validationStatus: null, updatedAt: new Date() }],
    });
    const response = await tasks(new NextRequest("http://localhost/api/terminal/tasks"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.incidents).toHaveLength(1);
    expect(body.tasks).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("amountCents");
  });

  it("cerrar tarea asignada la deja en PENDING_VERIFICATION (CU-V-14)", async () => {
    mockRepo.findTask.mockResolvedValue({
      id: "task-1", assignedTo: "tecnico1", requiresSignature: false,
    });
    mockRepo.completeTask.mockResolvedValue({
      task: { id: "task-1", dueDate: "2026-10-19", status: "DONE", overdue: false, planName: "Revisión", equipment: null, roomNumber: null, areaName: null, requiresSignature: false, assignedTo: "tecnico1", validationStatus: "PENDING_VERIFICATION", updatedAt: new Date() },
      next: null,
    });
    const response = await patchTask(
      new NextRequest("http://localhost/api/terminal/tasks", {
        method: "PATCH",
        body: JSON.stringify({ kind: "task", id: "task-1", action: "close", expectedUpdatedAt: "2026-10-19T10:00:00.000Z" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockRepo.completeTask).toHaveBeenCalledWith(
      "task-1", "Técnico Uno", null,
      expect.objectContaining({ validationStatus: "PENDING_VERIFICATION" }),
    );
  });

  it("no permite cerrar una tarea que no está asignada al operario", async () => {
    mockRepo.findTask.mockResolvedValue({ id: "task-1", assignedTo: "otro", requiresSignature: false });
    const response = await patchTask(
      new NextRequest("http://localhost/api/terminal/tasks", {
        method: "PATCH",
        body: JSON.stringify({ kind: "task", id: "task-1", action: "close" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
  });
});
