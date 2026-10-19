import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  MaintenanceError,
  MaintenanceRepository,
  nextDueDate,
  type AreaPeriodicity,
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

function areaTypeRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    code: "POOL_FILTER",
    name_es: "Filtro/Bomba de Piscina",
    name_en: "Pool filter/pump",
    name_ru: "Фильтр/насос бассейна",
    is_critical: true,
    sort_order: 1,
    ...overrides,
  };
}

/** Fila de área ya unida con su tipo (`AREA_SELECT`). */
function areaRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "area-1",
    area_type_code: "POOL_FILTER",
    area_type_name: "Filtro/Bomba de Piscina",
    is_critical: true,
    name: "Piscina principal",
    location_notes: "Planta baja",
    is_active: true,
    created_at: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function areaTaskRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "atask-1",
    area_id: "area-1",
    label: "Limpieza de filtros",
    periodicity: "WEEKLY",
    estimated_minutes: 30,
    is_active: true,
    created_by: "jefe-mantenimiento",
    created_at: new Date("2026-09-02T00:00:00Z"),
    ...overrides,
  };
}

function areaLogRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "alog-1",
    task_id: "atask-1",
    performed_by: "tecnico",
    performed_at: new Date("2026-09-27T08:00:00Z"),
    notes: "Filtros limpios",
    evidence_path: "evidencia/alog-1.jpg",
    verified_by: null,
    verified_at: null,
    signature_id: null,
    area_id: "area-1",
    task_label: "Limpieza de filtros",
    area_name: "Piscina principal",
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

/** Pruebas de áreas comunes y áreas críticas (F1 · T1.9). */
describe("MaintenanceRepository · áreas comunes (F1 · T1.9)", () => {
  let repository: MaintenanceRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn(), connect: vi.fn() } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new MaintenanceRepository(mockPool);
  });

  describe("catálogo y áreas", () => {
    it("lista el catálogo de tipos ordenado, con 4 críticas", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          areaTypeRow(),
          areaTypeRow({ code: "GARDEN", name_es: "Jardines", is_critical: false, sort_order: 2 }),
          areaTypeRow({ code: "WATER_PUMP", name_es: "Bomba de agua", sort_order: 3 }),
          areaTypeRow({ code: "ELEVATOR", name_es: "Ascensor", sort_order: 8 }),
          areaTypeRow({ code: "ELECTRIC_GENERATOR", name_es: "Generador Eléctrico", sort_order: 9 }),
        ],
        rowCount: 5,
      });
      const types = await repository.listAreaTypes();
      expect(types).toHaveLength(5);
      expect(types.filter((type) => type.isCritical)).toHaveLength(4);
      expect(types[0]).toMatchObject({
        code: "POOL_FILTER",
        nameEs: "Filtro/Bomba de Piscina",
        sortOrder: 1,
        isCritical: true,
      });
      expect(String(mockPool.query.mock.calls[0]?.[0])).toContain("ORDER BY sort_order");
    });

    it("lista áreas activas por defecto y filtra por críticas o inactivas", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [areaRow()], rowCount: 1 });
      const active = await repository.listAreas();
      expect(active[0]).toMatchObject({
        id: "area-1",
        areaTypeCode: "POOL_FILTER",
        areaTypeName: "Filtro/Bomba de Piscina",
        isCritical: true,
        isActive: true,
      });
      const defaultSql = String(mockPool.query.mock.calls[0]?.[0]);
      expect(defaultSql).toContain("a.is_active = TRUE");
      expect(defaultSql).not.toContain("is_critical = TRUE");

      mockPool.query.mockResolvedValueOnce({ rows: [areaRow()], rowCount: 1 });
      await repository.listAreas({ onlyCritical: true });
      expect(String(mockPool.query.mock.calls[1]?.[0])).toContain("t.is_critical = TRUE");

      mockPool.query.mockResolvedValueOnce({ rows: [areaRow({ is_active: false })], rowCount: 1 });
      const all = await repository.listAreas({ includeInactive: true });
      expect(String(mockPool.query.mock.calls[2]?.[0])).not.toContain("a.is_active = TRUE");
      expect(all[0]?.isActive).toBe(false);
    });

    it("findArea devuelve el área con su tipo o null", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [areaRow()], rowCount: 1 });
      const area = await repository.findArea("area-1");
      expect(area?.name).toBe("Piscina principal");
      expect(area?.isCritical).toBe(true);

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      expect(await repository.findArea("nope")).toBeNull();
    });

    it("createArea rechaza un tipo inexistente", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repository.createArea({ areaTypeCode: "NOPE", name: "Área X" })).rejects.toMatchObject({
        code: "AREA_TYPE_NOT_FOUND",
      });
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it("createArea valida el tipo y devuelve el registro con su tipo", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [areaTypeRow()], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [areaRow({ location_notes: null })], rowCount: 1 });
      const area = await repository.createArea({ areaTypeCode: "POOL_FILTER", name: "Piscina principal" });
      expect(area.isCritical).toBe(true);
      expect(area.areaTypeName).toBe("Filtro/Bomba de Piscina");
      const insert = mockPool.query.mock.calls[1];
      expect(String(insert?.[0])).toContain("INSERT INTO maintenance_areas");
      expect(insert?.[1]).toEqual(["POOL_FILTER", "Piscina principal", null]);
    });

    it("updateArea lanza AREA_NOT_FOUND si no existe", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repository.updateArea("nope", { name: "Área X" })).rejects.toMatchObject({
        code: "AREA_NOT_FOUND",
      });
    });

    it("updateArea aplica los cambios y devuelve el área", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: "area-1" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [areaRow({ name: "Piscina reformada", is_active: false })], rowCount: 1 });
      const area = await repository.updateArea("area-1", { name: "Piscina reformada", isActive: false });
      expect(area.name).toBe("Piscina reformada");
      expect(area.isActive).toBe(false);
      const [sql, values] = mockPool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("name = $2");
      expect(sql).toContain("is_active = $3");
      expect(values).toEqual(["area-1", "Piscina reformada", false]);
    });

    it("listCriticalAreas devuelve solo áreas activas de tipo crítico", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          areaRow(),
          areaRow({ id: "area-2", area_type_code: "ELEVATOR", area_type_name: "Ascensor", name: "Ascensor 1" }),
        ],
        rowCount: 2,
      });
      const areas = await repository.listCriticalAreas();
      expect(areas).toHaveLength(2);
      expect(areas.every((area) => area.isCritical && area.isActive)).toBe(true);
      const sql = String(mockPool.query.mock.calls[0]?.[0]);
      expect(sql).toContain("t.is_critical = TRUE");
      expect(sql).toContain("a.is_active = TRUE");
    });
  });

  describe("tareas de área", () => {
    it("listAreaTasks filtra las inactivas salvo que se pidan", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [areaTaskRow()], rowCount: 1 });
      const tasks = await repository.listAreaTasks("area-1");
      expect(tasks[0]).toMatchObject({
        id: "atask-1",
        areaId: "area-1",
        label: "Limpieza de filtros",
        periodicity: "WEEKLY",
        estimatedMinutes: 30,
        isActive: true,
      });
      expect(String(mockPool.query.mock.calls[0]?.[0])).toContain("is_active = TRUE");
      expect(mockPool.query.mock.calls[0]?.[1]).toEqual(["area-1"]);

      mockPool.query.mockResolvedValueOnce({ rows: [areaTaskRow({ is_active: false })], rowCount: 1 });
      const all = await repository.listAreaTasks("area-1", { includeInactive: true });
      expect(String(mockPool.query.mock.calls[1]?.[0])).not.toContain("is_active = TRUE");
      expect(all[0]?.isActive).toBe(false);
    });

    it("createAreaTask crea la tarea tras validar el área", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: "area-1" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [areaTaskRow()], rowCount: 1 });
      const task = await repository.createAreaTask({
        areaId: "area-1",
        label: "Limpieza de filtros",
        periodicity: "WEEKLY",
        estimatedMinutes: 30,
        createdBy: "jefe-mantenimiento",
      });
      expect(task).toMatchObject({ periodicity: "WEEKLY", estimatedMinutes: 30, createdBy: "jefe-mantenimiento" });
      expect(String(mockPool.query.mock.calls[1]?.[0])).toContain("INSERT INTO maintenance_area_tasks");
    });

    it("createAreaTask rechaza un área inexistente", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        repository.createAreaTask({ areaId: "nope", label: "X", periodicity: "DAILY", createdBy: "yo" }),
      ).rejects.toMatchObject({ code: "AREA_NOT_FOUND" });
    });

    it("createAreaTask rechaza una periodicidad fuera del dominio sin tocar la BD", async () => {
      await expect(
        repository.createAreaTask({
          areaId: "area-1",
          label: "X",
          periodicity: "HOURLY" as AreaPeriodicity,
          createdBy: "yo",
        }),
      ).rejects.toMatchObject({ code: "AREA_TASK_INVALID_PERIODICITY" });
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it("setAreaTaskActive activa/desactiva y falla si la tarea no existe", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [areaTaskRow({ is_active: false })], rowCount: 1 });
      expect((await repository.setAreaTaskActive("atask-1", false)).isActive).toBe(false);

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repository.setAreaTaskActive("nope", true)).rejects.toMatchObject({
        code: "AREA_TASK_NOT_FOUND",
      });
    });
  });

  describe("registros y verificación", () => {
    it("registerAreaLog registra la ejecución con verificación nula", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: "atask-1" }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [areaLogRow()], rowCount: 1 });
      const log = await repository.registerAreaLog({
        taskId: "atask-1",
        performedBy: "tecnico",
        notes: "Filtros limpios",
        evidencePath: "evidencia/alog-1.jpg",
      });
      expect(log).toMatchObject({
        taskId: "atask-1",
        performedBy: "tecnico",
        verifiedBy: null,
        verifiedAt: null,
        signatureId: null,
      });
      expect(String(mockPool.query.mock.calls[1]?.[0])).toContain("INSERT INTO maintenance_area_logs");
    });

    it("registerAreaLog rechaza una tarea inexistente", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repository.registerAreaLog({ taskId: "nope", performedBy: "tecnico" })).rejects.toMatchObject({
        code: "AREA_TASK_NOT_FOUND",
      });
    });

    it("verifyAreaLog fija quién, cuándo y la firma", async () => {
      const verifiedAt = new Date("2026-09-27T09:00:00Z");
      mockPool.query.mockResolvedValueOnce({
        rows: [areaLogRow({ verified_by: "supervisor", verified_at: verifiedAt, signature_id: "sig-1" })],
        rowCount: 1,
      });
      const log = await repository.verifyAreaLog("alog-1", { verifiedBy: "supervisor", signatureId: "sig-1" });
      expect(log.verifiedBy).toBe("supervisor");
      expect(log.verifiedAt).toBe(verifiedAt);
      expect(log.signatureId).toBe("sig-1");
      const [sql, values] = mockPool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("verified_at = NOW()");
      expect(sql).toContain("verified_at IS NULL");
      expect(values).toEqual(["alog-1", "supervisor", "sig-1"]);
    });

    it("verifyAreaLog rechaza una doble verificación (AREA_LOG_NOT_FOUND, motivo 'ya verificado')", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ verified_at: new Date() }], rowCount: 1 });
      await expect(repository.verifyAreaLog("alog-1", { verifiedBy: "supervisor" })).rejects.toMatchObject({
        code: "AREA_LOG_NOT_FOUND",
        message: expect.stringContaining("ya estaba verificado"),
      });
    });

    it("verifyAreaLog rechaza un registro inexistente (AREA_LOG_NOT_FOUND, motivo 'no existe')", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(repository.verifyAreaLog("nope", { verifiedBy: "supervisor" })).rejects.toMatchObject({
        code: "AREA_LOG_NOT_FOUND",
        message: expect.stringContaining("no existe"),
      });
    });

    it("listAreaLogs aplica filtros y une tarea/área", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [areaLogRow()], rowCount: 1 });
      const logs = await repository.listAreaLogs({
        areaId: "area-1",
        from: "2026-09-01",
        to: "2026-09-30",
        pendingVerification: true,
      });
      expect(logs[0]).toMatchObject({
        areaId: "area-1",
        taskLabel: "Limpieza de filtros",
        areaName: "Piscina principal",
        verifiedAt: null,
      });
      const [sql, values] = mockPool.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("JOIN maintenance_area_tasks");
      expect(sql).toContain("t.area_id = $1");
      expect(sql).toContain("l.performed_at >= $2");
      expect(sql).toContain("l.performed_at <= $3");
      expect(sql).toContain("l.verified_at IS NULL");
      expect(sql).toContain("ORDER BY l.performed_at DESC");
      expect(values).toEqual(["area-1", "2026-09-01", "2026-09-30"]);
    });
  });

  describe("área en incidencias y planes", () => {
    it("escribe area_id al reportar una incidencia y al crear un plan", async () => {
      const incidentClient = fakeTxClient({});
      mockPool.connect.mockResolvedValueOnce(incidentClient);
      await repository.reportIncident({
        roomId: "room-1",
        kind: "FONTANERIA",
        reportedBy: "recepcion",
        areaId: "area-1",
      });
      const incidentInsert = incidentClient.query.mock.calls.find(([sql]) =>
        String(sql).includes("INSERT INTO maintenance_incidents"),
      );
      expect(String(incidentInsert?.[0])).toContain("area_id");
      expect(incidentInsert?.[1] as unknown[]).toContain("area-1");

      const planClient = fakeTxClient({});
      mockPool.connect.mockResolvedValueOnce(planClient);
      await repository.createPlan({
        code: "CAL-02",
        name: "Caldera auxiliar",
        equipment: "Caldera",
        periodicity: "MONTHLY",
        firstDueDate: "2026-10-01",
        areaId: "area-1",
      });
      const planInsert = planClient.query.mock.calls.find(([sql]) =>
        String(sql).includes("INSERT INTO preventive_plans"),
      );
      expect(String(planInsert?.[0])).toContain("area_id");
      expect(planInsert?.[1] as unknown[]).toContain("area-1");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F4 · T4.6 — bloqueo/desbloqueo firmado de habitación
// ─────────────────────────────────────────────────────────────────────────────

function blockTxClient(options: {
  room?: QueryResultRow;
  history?: QueryResultRow[];
  incident?: QueryResultRow | null;
}): PoolClient & { query: Mock; release: Mock } {
  const query = vi.fn(async (sql: string) => {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };
    if (s.startsWith("SELECT id, room_number, publication_status, archived_at FROM rooms")) {
      return {
        rows: [
          options.room ?? {
            id: "room-1",
            room_number: 201,
            publication_status: "PUBLISHED",
            archived_at: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (s.startsWith("SELECT id, room_id, status FROM maintenance_incidents")) {
      if (options.incident === null) return { rows: [], rowCount: 0 };
      return {
        rows: [options.incident ?? { id: "inc-1", room_id: "room-1", status: "OPEN" }],
        rowCount: 1,
      };
    }
    if (s.startsWith("SELECT from_value FROM room_status_history")) {
      return { rows: options.history ?? [{ from_value: "PUBLISHED" }], rowCount: 1 };
    }
    if (s.startsWith("UPDATE rooms")) return { rows: [], rowCount: 1 };
    if (s.startsWith("INSERT INTO room_status_history")) return { rows: [], rowCount: 1 };
    if (s.startsWith("UPDATE maintenance_incidents")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() } as unknown as PoolClient & { query: Mock; release: Mock };
}

describe("MaintenanceRepository · bloqueo firmado (F4 · T4.6)", () => {
  let repository: MaintenanceRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn(), connect: vi.fn() } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new MaintenanceRepository(mockPool);
  });

  it("bloquear exige firma y deja la habitación en MAINTENANCE con historial", async () => {
    const client = blockTxClient({});
    mockPool.connect.mockResolvedValueOnce(client);
    const result = await repository.blockRoomWithSignature({
      roomId: "room-1",
      signatureId: "sig-1",
      actor: "jefe@hotel.es",
      incidentId: "inc-1",
      reason: "Fuga de agua",
      until: "2026-10-25",
    });

    expect(result.publicationStatus).toBe("MAINTENANCE");
    expect(result.previousPublicationStatus).toBe("PUBLISHED");
    expect(result.blockedUntil).toBe("2026-10-25");
    const sqls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("maintenance_blocked_until = $3::date"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("INSERT INTO room_status_history"))).toBe(true);
    expect(
      sqls.some((sql) => sql.includes("UPDATE maintenance_incidents SET block_signature_id")),
    ).toBe(true);
  });

  it("sin signatureId lanza SIGNATURE_REQUIRED sin abrir transacción", async () => {
    await expect(
      repository.blockRoomWithSignature({ roomId: "room-1", signatureId: "  ", actor: "x" }),
    ).rejects.toMatchObject({ code: "SIGNATURE_REQUIRED" });
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("una habitación ya bloqueada lanza ROOM_ALREADY_BLOCKED", async () => {
    mockPool.connect.mockResolvedValueOnce(
      blockTxClient({ room: { id: "room-1", room_number: 201, publication_status: "MAINTENANCE", archived_at: null } }),
    );
    await expect(
      repository.blockRoomWithSignature({ roomId: "room-1", signatureId: "sig-1", actor: "x" }),
    ).rejects.toMatchObject({ code: "ROOM_ALREADY_BLOCKED" });
  });

  it("una incidencia cerrada no se puede firmar (INCIDENT_CLOSED)", async () => {
    mockPool.connect.mockResolvedValueOnce(
      blockTxClient({ incident: { id: "inc-1", room_id: "room-1", status: "RESOLVED" } }),
    );
    await expect(
      repository.blockRoomWithSignature({
        roomId: "room-1",
        signatureId: "sig-1",
        actor: "x",
        incidentId: "inc-1",
      }),
    ).rejects.toMatchObject({ code: "INCIDENT_CLOSED" });
  });

  it("desbloquear restaura el estado previo (PUBLISHED) y limpia el bloqueo", async () => {
    const client = blockTxClient({
      room: { id: "room-1", room_number: 201, publication_status: "MAINTENANCE", archived_at: null },
      history: [{ from_value: "PUBLISHED" }],
    });
    mockPool.connect.mockResolvedValueOnce(client);
    const result = await repository.unblockRoomWithSignature({
      roomId: "room-1",
      signatureId: "sig-2",
      actor: "jefe@hotel.es",
      incidentId: "inc-1",
    });
    expect(result.publicationStatus).toBe("PUBLISHED");
    const sqls = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes("maintenance_blocked_until = NULL"))).toBe(true);
    expect(
      sqls.some((sql) => sql.includes("UPDATE maintenance_incidents SET unblock_signature_id")),
    ).toBe(true);
  });

  it("sin historial, el desbloqueo deja la habitación en DRAFT (no inventa PUBLISHED)", async () => {
    mockPool.connect.mockResolvedValueOnce(
      blockTxClient({
        room: { id: "room-1", room_number: 201, publication_status: "MAINTENANCE", archived_at: null },
        history: [],
      }),
    );
    const result = await repository.unblockRoomWithSignature({
      roomId: "room-1",
      signatureId: "sig-2",
      actor: "jefe@hotel.es",
    });
    expect(result.publicationStatus).toBe("DRAFT");
  });

  it("desbloquear una habitación no bloqueada lanza ROOM_NOT_BLOCKED", async () => {
    mockPool.connect.mockResolvedValueOnce(blockTxClient({}));
    await expect(
      repository.unblockRoomWithSignature({ roomId: "room-1", signatureId: "sig-2", actor: "x" }),
    ).rejects.toMatchObject({ code: "ROOM_NOT_BLOCKED" });
  });
});
