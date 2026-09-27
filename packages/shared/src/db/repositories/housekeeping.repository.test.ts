import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  DEFAULT_CLEANING_CONSUMPTION,
  HousekeepingError,
  HousekeepingRepository,
} from "./housekeeping.repository";

/**
 * Pruebas del repositorio de Housekeeping (F3 · D-19, D-30, D-48…D-51, D-62, D-64).
 *
 * Se sustituye el pool por un doble que enruta por palabra clave del SQL, igual que en el resto de
 * repositorios. Las transacciones usan un cliente simulado que responde a `BEGIN`/`COMMIT`/`ROLLBACK`.
 */

function supplyRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "sup-1",
    code: "SOAP",
    name_es: "Jabón",
    name_en: "Soap",
    name_ru: "Мыло",
    unit: "unit",
    stock_qty: "10.00",
    threshold_qty: "2.00",
    updated_at: new Date("2026-09-27T00:00:00Z"),
    ...overrides,
  };
}

function assignmentRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "asg-1",
    shift_id: "shift-1",
    room_id: "room-1",
    room_number: 101,
    assignee: "Marta",
    status: "PENDING",
    assigned_at: new Date("2026-09-27T06:00:00Z"),
    completed_at: null,
    ...overrides,
  };
}

/** Cliente transaccional simulado: enruta por palabra clave del SQL. */
function fakeTxClient(handlers: {
  lockedAssignment?: QueryResultRow | null;
  updatedAssignment?: QueryResultRow;
  supplyItems?: QueryResultRow[];
  updatedSupply?: QueryResultRow;
  roomLock?: QueryResultRow | null;
}): PoolClient & { query: Mock; release: Mock } {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(s)) return { rows: [], rowCount: 0 };

    if (s.startsWith("SELECT a.*, r.room_number, r.operational_status")) {
      const locked = handlers.lockedAssignment;
      return { rows: locked ? [locked] : [], rowCount: locked ? 1 : 0 };
    }
    if (s.startsWith("SELECT id, room_number, room_type, operational_status FROM rooms")) {
      const room = handlers.roomLock;
      return { rows: room ? [room] : [], rowCount: room ? 1 : 0 };
    }
    if (s.startsWith("UPDATE housekeeping_assignments")) {
      return {
        rows: [handlers.updatedAssignment ?? assignmentRow({ status: "DONE" })],
        rowCount: 1,
      };
    }
    if (s.startsWith("INSERT INTO housekeeping_room_logs")) return { rows: [], rowCount: 1 };
    if (s.startsWith("UPDATE rooms")) return { rows: [], rowCount: 1 };

    if (s.startsWith("SELECT * FROM supply_items WHERE code")) {
      const code = String(values?.[0] ?? "");
      const items = handlers.supplyItems ?? [];
      const found = items.filter((item) => item.code === code);
      return { rows: found, rowCount: found.length };
    }
    if (s.startsWith("UPDATE supply_items SET stock_qty = stock_qty -")) {
      const qty = Number(values?.[1] ?? 0);
      const base = handlers.supplyItems?.[0] ?? supplyRow();
      const updated = handlers.updatedSupply ?? {
        ...base,
        stock_qty: String(Number(base.stock_qty) - qty),
      };
      return { rows: [updated], rowCount: 1 };
    }
    if (s.startsWith("UPDATE supply_items SET stock_qty = stock_qty +")) {
      return {
        rows: [handlers.updatedSupply ?? supplyRow({ stock_qty: "15.00" })],
        rowCount: 1,
      };
    }
    if (s.startsWith("INSERT INTO supply_stock_movements")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, release: vi.fn() } as unknown as PoolClient & { query: Mock; release: Mock };
}

describe("HousekeepingRepository (F3 · D-48…D-51, D-62, D-64)", () => {
  let repository: HousekeepingRepository;
  let mockPool: Pool & { query: Mock; connect: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      connect: vi.fn(),
    } as unknown as Pool & { query: Mock; connect: Mock };
    repository = new HousekeepingRepository(mockPool);
  });

  describe("turnos", () => {
    it("crea el turno del día y lo mapea", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "shift-1",
            shift_date: "2026-09-27",
            label: "MANANA",
            supervisor: "Elena",
            created_at: new Date("2026-09-27T05:00:00Z"),
          },
        ],
        rowCount: 1,
      });
      const shift = await repository.createShift({
        shiftDate: "2026-09-27",
        label: "MANANA",
        supervisor: "Elena",
      });
      expect(shift).toEqual({
        id: "shift-1",
        shiftDate: "2026-09-27",
        label: "MANANA",
        supervisor: "Elena",
        createdAt: new Date("2026-09-27T05:00:00Z"),
      });
    });

    it("traduce el turno duplicado a un error de negocio SHIFT_EXISTS", async () => {
      mockPool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
      await expect(
        repository.createShift({ shiftDate: "2026-09-27", label: "MANANA", supervisor: "Elena" }),
      ).rejects.toMatchObject({ code: "SHIFT_EXISTS" });
    });
  });

  describe("ocupación y reparto (D-48)", () => {
    it("deduce el motivo de cada habitación a limpiar", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: "a", room_number: 101, room_type: "DOBLE", operational_status: "OCCUPIED", checks_out: true },
          { id: "b", room_number: 102, room_type: "SIMPLE", operational_status: "DIRTY", checks_out: false },
          { id: "c", room_number: 103, room_type: "SUITE", operational_status: "OCCUPIED", checks_out: false },
        ],
        rowCount: 3,
      });
      const rooms = await repository.listRoomsToClean("2026-09-27");
      expect(rooms.map((room) => room.reason)).toEqual(["CHECKOUT", "DIRTY", "STAYOVER"]);
    });

    it("reparte rotando entre las camareras y es idempotente", async () => {
      // getShift
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "shift-1", shift_date: "2026-09-27", label: "MANANA", supervisor: "Elena", created_at: new Date() }],
        rowCount: 1,
      });
      // listRoomsToClean
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: "a", room_number: 101, room_type: "DOBLE", operational_status: "DIRTY", checks_out: false },
          { id: "b", room_number: 102, room_type: "SIMPLE", operational_status: "DIRTY", checks_out: false },
          { id: "c", room_number: 103, room_type: "SUITE", operational_status: "DIRTY", checks_out: false },
        ],
        rowCount: 3,
      });
      // listAssignments (existentes)
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Inserciones y lectura final del tablero del turno.
      mockPool.query.mockResolvedValue({
        rows: [assignmentRow({ room_number: 101 }), assignmentRow({ room_number: 102 }), assignmentRow({ room_number: 103 })],
        rowCount: 3,
      });

      const result = await repository.autoAssign("shift-1", ["Marta", "Lucía"]);
      expect(result).toHaveLength(3);
      const inserts = mockPool.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO housekeeping_assignments"));
      expect(inserts).toHaveLength(3);
      expect(inserts.map(([, values]) => (values as unknown[])[2])).toEqual(["Marta", "Lucía", "Marta"]);
    });

    it("exige al menos una camarera", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "shift-1", shift_date: "2026-09-27", label: "MANANA", supervisor: "Elena", created_at: new Date() }],
        rowCount: 1,
      });
      await expect(repository.autoAssign("shift-1", ["  "])).rejects.toMatchObject({
        code: "ASSIGNMENT_NOT_FOUND",
      });
    });
  });

  describe("estados operativos (D-19)", () => {
    it("marca una asignación en curso", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [assignmentRow({ status: "IN_PROGRESS" })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [assignmentRow({ status: "IN_PROGRESS" })], rowCount: 1 });
      const result = await repository.startAssignment("asg-1");
      expect(result?.status).toBe("IN_PROGRESS");
    });

    it("al terminar deja la habitación limpia, con traza y consumo, y avisa del stock bajo", async () => {
      const client = fakeTxClient({
        lockedAssignment: { ...assignmentRow(), operational_status: "DIRTY" },
        supplyItems: [supplyRow({ code: "SOAP", stock_qty: "3.00", threshold_qty: "2.00" })],
      });
      mockPool.connect.mockResolvedValueOnce(client);

      const result = await repository.completeAssignment("asg-1", "Marta", [{ code: "SOAP", quantity: 2 }]);

      expect(result.assignment.status).toBe("DONE");
      expect(result.roomNumber).toBe(101);
      // 3 - 2 = 1 ≤ 2 (umbral) → alerta de stock bajo (D-51/D-64).
      expect(result.lowStock.map((item) => item.code)).toEqual(["SOAP"]);
      const sqls = client.query.mock.calls.map(([sql]) => String(sql));
      expect(sqls.some((sql) => sql.includes("INSERT INTO housekeeping_room_logs"))).toBe(true);
      expect(sqls.some((sql) => sql.includes("UPDATE rooms SET operational_status = 'CLEAN'"))).toBe(true);
      expect(sqls.some((sql) => sql.includes("INSERT INTO supply_stock_movements"))).toBe(true);
    });

    it("no vuelve a completar una habitación ya terminada", async () => {
      const client = fakeTxClient({ lockedAssignment: { ...assignmentRow({ status: "DONE" }), operational_status: "CLEAN" } });
      mockPool.connect.mockResolvedValueOnce(client);
      await expect(repository.completeAssignment("asg-1", "Marta", [])).rejects.toBeInstanceOf(
        HousekeepingError,
      );
    });
  });

  describe("lencería y suministros (D-51, D-64)", () => {
    it("nunca deja el stock en negativo: consume como mucho lo disponible", async () => {
      const client = fakeTxClient({
        supplyItems: [supplyRow({ code: "SOAP", stock_qty: "1.00" })],
      });
      mockPool.connect.mockResolvedValueOnce(client);
      const [result] = await repository.consumeSupplies([{ code: "SOAP", quantity: 5 }], "Elena");
      expect(result?.consumed).toBe(1);
      expect(result?.item.stockQty).toBe(0);
    });

    it("la reposición suma stock y registra el movimiento", async () => {
      mockPool.connect.mockResolvedValueOnce(
        fakeTxClient({ updatedSupply: supplyRow({ stock_qty: "20.00" }) }),
      );
      const item = await repository.restock("sup-1", 10, "Elena");
      expect(item.stockQty).toBe(20);
    });

    it("lista los artículos bajo umbral ordenados por déficit", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [supplyRow({ code: "PAPER", stock_qty: "0.00", threshold_qty: "40.00" })],
        rowCount: 1,
      });
      const low = await repository.listLowStock();
      expect(low[0]?.code).toBe("PAPER");
    });

    it("define el consumo por defecto de una habitación limpia", () => {
      expect(DEFAULT_CLEANING_CONSUMPTION.map((line) => line.code)).toContain("SHEETS");
    });
  });

  describe("tablero (D-30)", () => {
    it("compone turnos, asignaciones y alertas del día", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // listShifts
        .mockResolvedValueOnce({ rows: [assignmentRow()], rowCount: 1 }) // listAssignmentsByDate
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // listLowStock
      const board = await repository.getBoard("2026-09-27");
      expect(board.date).toBe("2026-09-27");
      expect(board.assignments).toHaveLength(1);
      expect(typeof board.generatedAt).toBe("string");
    });

    it("lee los últimos cambios de estado del día para el feed", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "log-1", room_id: "room-1", room_number: 101, from_value: "DIRTY", to_value: "CLEAN", changed_by: "Marta", changed_at: new Date() }],
        rowCount: 1,
      });
      const logs = await repository.listRecentRoomLogs("2026-09-27");
      expect(logs[0]?.to_value).toBe("CLEAN");
    });
  });
});
