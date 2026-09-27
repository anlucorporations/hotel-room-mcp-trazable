import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  MaintenanceError,
  MaintenanceRepository,
  nextDueDate,
} from "./maintenance.repository";

/** Pruebas del repositorio de Mantenimiento (F4 · D-52…D-54, D-63). */

function incidentRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "inc-1",
    room_id: "room-1",
    room_number: 101,
    kind: "FONTANERIA",
    description: "Fuga bajo el lavabo",
    priority: "HIGH",
    status: "OPEN",
    blocks_sale: true,
    reported_by: "recepcion",
    assigned_to: null,
    created_at: new Date("2026-09-27T08:00:00Z"),
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

function taskRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "task-1",
    plan_id: "plan-1",
    due_date: "2026-09-20",
    status: "PENDING",
    completed_by: null,
    completed_at: null,
    notes: null,
    plan_code: "CAL-01",
    plan_name: "Caldera principal",
    equipment: "Caldera",
    periodicity: "MONTHLY",
    room_number: null,
    active: true,
    ...overrides,
  };
}

function planRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "plan-1",
    code: "CAL-01",
    name: "Caldera principal",
    equipment: "Caldera",
    room_id: null,
    room_number: null,
    periodicity: "MONTHLY",
    active: true,
    created_at: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

/** Cliente transaccional simulado: enruta por palabra clave del SQL. */
function fakeTxClient(handlers: {
  room?: QueryResultRow[];
  incident?: QueryResultRow;
  incidentStatus?: string;
  planId?: string;
  task?: QueryResultRow;
  updatedTask?: QueryResultRow;
  nextTaskId?: string | null;
  plan?: QueryResultRow;
}): PoolClient & { query: Mock; release: Mock } {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };

    if (s.startsWith("SELECT id FROM rooms")) {
      return { rows: handlers.room ?? [{ id: "room-1" }], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO maintenance_incidents")) {
      return { rows: [handlers.incident ?? incidentRow()], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO maintenance_incident_events")) return { rows: [], rowCount: 1 };
    if (s.startsWith("SELECT status FROM maintenance_incidents")) {
      return { rows: [{ status: handlers.incidentStatus ?? "OPEN" }], rowCount: 1 };
    }
    if (s.startsWith("UPDATE maintenance_incidents")) return { rows: [], rowCount: 1 };
    if (s.startsWith("SELECT i.*, r.room_number")) {
      return { rows: [handlers.incident ?? incidentRow()], rowCount: 1 };
    }

    if (s.startsWith("INSERT INTO preventive_plans")) {
      return { rows: [{ id: handlers.planId ?? "plan-1" }], rowCount: 1 };
    }
    if (s.startsWith("INSERT INTO preventive_tasks")) {
      return handlers.nextTaskId === null
        ? { rows: [], rowCount: 0 }
        : { rows: [{ id: handlers.nextTaskId ?? "task-next" }], rowCount: 1 };
    }
    if (s.startsWith("SELECT t.*, p.periodicity, p.active FROM preventive_tasks")) {
      return { rows: [handlers.task ?? taskRow()], rowCount: 1 };
    }
    if (s.startsWith("UPDATE preventive_tasks")) {
      return {
        rows: [handlers.updatedTask ?? taskRow({ status: "DONE", completed_by: "tecnico", completed_at: new Date() })],
        rowCount: 1,
      };
    }
    if (s.startsWith("SELECT t.*, p.code AS plan_code")) {
      // `findTaskWith` sirve tanto a la tarea recién cerrada (DONE) como a la siguiente (PENDING).
      const id = String(values?.[0] ?? "");
      if (id === (handlers.nextTaskId ?? "task-next")) {
        return { rows: [handlers.task ?? taskRow()], rowCount: 1 };
      }
      return {
        rows: [handlers.updatedTask ?? handlers.task ?? taskRow()],
        rowCount: 1,
      };
    }
    if (s.startsWith("SELECT p.*, r.room_number FROM preventive_plans")) {
      return { rows: [handlers.plan ?? planRow()], rowCount: 1 };
    }
    if (s.startsWith("SELECT id FROM preventive_tasks WHERE plan_id")) {
      return { rows: [{ id: "task-existing" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() } as unknown as PoolClient & { query: Mock; release: Mock };
}

describe("MaintenanceRepository (F4 · D-52…D-54)", () => {
  let repository: MaintenanceRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn(), connect: vi.fn() } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new MaintenanceRepository(mockPool);
  });

  describe("periodicidad (D-54)", () => {
    it("calcula la siguiente fecha según la periodicidad", () => {
      expect(nextDueDate("2026-01-01", "WEEKLY")).toBe("2026-01-08");
      expect(nextDueDate("2026-01-01", "MONTHLY")).toBe("2026-01-31");
      expect(nextDueDate("2026-01-01", "QUARTERLY")).toBe("2026-04-01");
    });
  });

  describe("incidencias (D-52, D-53)", () => {
    it("reporta una incidencia con su evento REPORTED", async () => {
      const client = fakeTxClient({});
      mockPool.connect.mockResolvedValueOnce(client);
      const incident = await repository.reportIncident({
        roomId: "room-1",
        kind: "FONTANERIA",
        description: "Fuga",
        priority: "HIGH",
        reportedBy: "recepcion",
      });
      expect(incident.roomNumber).toBe(101);
      const sqls = client.query.mock.calls.map(([sql]) => String(sql));
      expect(sqls.some((sql) => sql.includes("INSERT INTO maintenance_incident_events"))).toBe(true);
    });

    it("rechaza una incidencia de una habitación inexistente", async () => {
      mockPool.connect.mockResolvedValueOnce(fakeTxClient({ room: [] }));
      await expect(
        repository.reportIncident({ roomId: "nope", kind: "OTROS", reportedBy: "recepcion" }),
      ).rejects.toMatchObject({ code: "ROOM_NOT_FOUND" });
    });

    it("resuelve la incidencia y libera el bloqueo (D-53)", async () => {
      const client = fakeTxClient({
        incidentStatus: "IN_PROGRESS",
        incident: incidentRow({ status: "RESOLVED", resolved_by: "tecnico" }),
      });
      mockPool.connect.mockResolvedValueOnce(client);
      const resolved = await repository.resolveIncident("inc-1", "tecnico", "Reparado");
      expect(resolved?.status).toBe("RESOLVED");
      const updates = client.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE maintenance_incidents"));
      expect(updates).toHaveLength(1);
      expect(String(updates[0]?.[0])).toContain("resolved_at");
      expect(updates[0]?.[1] as unknown[]).toContain("RESOLVED");
    });

    it("no vuelve a cerrar una incidencia ya cerrada", async () => {
      mockPool.connect.mockResolvedValueOnce(fakeTxClient({ incidentStatus: "RESOLVED" }));
      await expect(repository.resolveIncident("inc-1", "tecnico")).rejects.toBeInstanceOf(MaintenanceError);
    });

    it("lista las habitaciones bloqueadas por avería", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ room_id: "room-1" }, { room_id: "room-2" }], rowCount: 2 });
      expect(await repository.listBlockedRoomIds()).toEqual(["room-1", "room-2"]);
    });

    it("comprueba si una habitación está bloqueada", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 });
      expect(await repository.isRoomBlocked("room-1")).toBe(true);
    });
  });

  describe("preventivo (D-54)", () => {
    it("crea un plan con su primera tarea", async () => {
      mockPool.connect.mockResolvedValueOnce(fakeTxClient({}));
      const plan = await repository.createPlan({
        code: "CAL-01",
        name: "Caldera principal",
        equipment: "Caldera",
        periodicity: "MONTHLY",
        firstDueDate: "2026-10-01",
      });
      expect(plan.code).toBe("CAL-01");
    });

    it("traduce el código duplicado a PLAN_EXISTS", async () => {
      const client = fakeTxClient({});
      (client.query as Mock).mockImplementation(async (sql: string) => {
        if (String(sql).startsWith("INSERT INTO preventive_plans")) {
          throw Object.assign(new Error("dup"), { code: "23505" });
        }
        return { rows: [], rowCount: 0 };
      });
      mockPool.connect.mockResolvedValueOnce(client);
      await expect(
        repository.createPlan({
          code: "CAL-01",
          name: "Caldera",
          equipment: "Caldera",
          periodicity: "MONTHLY",
          firstDueDate: "2026-10-01",
        }),
      ).rejects.toMatchObject({ code: "PLAN_EXISTS" });
    });

    it("lista las tareas vencidas y de hoy (aviso)", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [taskRow({ due_date: "2026-09-20" })], rowCount: 1 });
      const due = await repository.listDueTasks("2026-09-27");
      expect(due).toHaveLength(1);
      expect(due[0]?.planCode).toBe("CAL-01");
    });

    it("cerrar una tarea programa la siguiente según la periodicidad", async () => {
      const client = fakeTxClient({
        task: taskRow({ due_date: "2026-09-01" }),
        updatedTask: taskRow({ status: "DONE", completed_by: "tecnico", completed_at: new Date() }),
        nextTaskId: "task-next",
      });
      mockPool.connect.mockResolvedValueOnce(client);
      const { task } = await repository.completeTask("task-1", "tecnico", "Revisada");
      expect(task.status).toBe("DONE");
      const inserts = client.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO preventive_tasks"));
      expect(inserts).toHaveLength(1);
      expect((inserts[0]?.[1] as unknown[])[1]).toBe("2026-10-01");
    });

    it("no cierra dos veces la misma tarea", async () => {
      mockPool.connect.mockResolvedValueOnce(fakeTxClient({ task: taskRow({ status: "DONE" }) }));
      await expect(repository.completeTask("task-1", "tecnico")).rejects.toMatchObject({ code: "TASK_CLOSED" });
    });
  });

  describe("tablero (D-63)", () => {
    it("compone incidencias abiertas, tareas vencidas y bloqueos", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [incidentRow()], rowCount: 1 }) // listIncidents
        .mockResolvedValueOnce({ rows: [taskRow()], rowCount: 1 }) // listDueTasks
        .mockResolvedValueOnce({ rows: [{ room_id: "room-1" }], rowCount: 1 }); // listBlockedRoomIds
      const board = await repository.getBoard("2026-09-27");
      expect(board.incidents).toHaveLength(1);
      expect(board.dueTasks).toHaveLength(1);
      expect(board.blockedRoomIds).toEqual(["room-1"]);
    });
  });
});
