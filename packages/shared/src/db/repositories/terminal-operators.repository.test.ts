import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, QueryResultRow } from "pg";
import {
  TerminalOperatorsError,
  TerminalOperatorsRepository,
} from "./terminal-operators.repository";

/**
 * Operarios de terminal (`terminal_operators`, F1 · T1.10 · D-C17/D-C42).
 *
 * Lo que se defiende aquí:
 *   1. **Alta**: `username` único; el duplicado (`23505`) es `USERNAME_TAKEN`, no un 500.
 *   2. **Rotación de PIN**: sella `pin_changed_at`, fija `must_change_pin` y limpia el bloqueo.
 *   3. **Bloqueo atómico**: el 5.º intento fallido bloquea en la MISMA sentencia (si no, dos intentos
 *      concurrentes leerían el mismo contador y el umbral no se alcanzaría nunca).
 *   4. **Desbloqueo/baja**: `unlock`, `resetFailedAttempts` y `setActive`, con `NOT_FOUND` cuando la
 *      fila no existe (ningún `UPDATE` silencioso).
 */

function operatorRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    username: "tecnico.1",
    full_name: "Ana Técnica",
    role: "MAINTENANCE_TECH",
    pin_hash: "$2b$10$hash",
    pin_changed_at: null,
    must_change_pin: true,
    failed_attempts: 0,
    locked_until: null,
    active: true,
    created_by: "owner",
    created_at: new Date("2026-10-10T08:00:00Z"),
    updated_at: new Date("2026-10-10T08:00:00Z"),
    ...overrides,
  };
}

/** Pool doble que enruta por respuesta encolada y permite inspeccionar SQL/parámetros. */
function fakePool() {
  const query = vi.fn(async () => ({ rows: [] as QueryResultRow[], rowCount: 0 }));
  return { pool: { query } as unknown as Pool & { query: Mock }, query };
}

/** Normaliza el SQL (espacios/retornos) para poder afirmar sobre fragmentos estables. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TerminalOperatorsRepository · alta", () => {
  it("da de alta un operario y mapea la fila a camelCase", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [operatorRow({ must_change_pin: true })], rowCount: 1 });

    const created = await repository.create({
      username: "tecnico.1",
      fullName: "Ana Técnica",
      role: "MAINTENANCE_TECH",
      pinHash: "$2b$10$hash",
      createdBy: "owner",
    });

    expect(created).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      username: "tecnico.1",
      fullName: "Ana Técnica",
      role: "MAINTENANCE_TECH",
      pinHash: "$2b$10$hash",
      mustChangePin: true,
      failedAttempts: 0,
      lockedUntil: null,
      active: true,
      createdBy: "owner",
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(normalize(sql)).toContain("INSERT INTO terminal_operators");
    expect(normalize(sql)).toContain(
      "(username, full_name, role, pin_hash, created_by)",
    );
    expect(values).toEqual(["tecnico.1", "Ana Técnica", "MAINTENANCE_TECH", "$2b$10$hash", "owner"]);
  });

  it("traduce la violación de unicidad (23505) a USERNAME_TAKEN", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

    await expect(
      repository.create({
        username: "camarera.1",
        fullName: "Bea Camarera",
        role: "HOUSEKEEPER",
        pinHash: "$2b$10$hash",
        createdBy: "owner",
      }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("propaga errores que no son de unicidad", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "42P01" }));

    await expect(
      repository.create({
        username: "tecnico.2",
        fullName: "Carlos Técnico",
        role: "MAINTENANCE_TECH",
        pinHash: "$2b$10$hash",
        createdBy: "owner",
      }),
    ).rejects.toThrow("boom");
  });

  it("rechaza un rol fuera del vocabulario del terminal", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);

    await expect(
      repository.create({
        username: "jefe.1",
        fullName: "Jefa de Mantenimiento",
        // El tipo lo prohíbe, pero la ruta HTTP llega como string: el guard de runtime es real.
        role: "HEAD_MAINTENANCE" as never,
        pinHash: "$2b$10$hash",
        createdBy: "owner",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ROLE" });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("TerminalOperatorsRepository · consultas", () => {
  it("busca por id y por username, y devuelve null si no hay fila", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query
      .mockResolvedValueOnce({ rows: [operatorRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [operatorRow({ username: "camarera.1" })], rowCount: 1 });

    expect((await repository.findById("11111111-1111-1111-1111-111111111111"))?.username).toBe("tecnico.1");
    expect(await repository.findByUsername("nadie")).toBeNull();
    expect((await repository.findByUsername("camarera.1"))?.username).toBe("camarera.1");

    const [byIdSql, byIdValues] = query.mock.calls[0] as [string, unknown[]];
    expect(normalize(byIdSql)).toContain("WHERE id = $1");
    expect(byIdValues).toEqual(["11111111-1111-1111-1111-111111111111"]);
    const [byUserSql, byUserValues] = query.mock.calls[2] as [string, unknown[]];
    expect(normalize(byUserSql)).toContain("WHERE username = $1");
    expect(byUserValues).toEqual(["camarera.1"]);
  });

  it("lista sin filtros ordenando por full_name", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [operatorRow()], rowCount: 1 });

    const list = await repository.list();
    expect(list).toHaveLength(1);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(normalize(sql)).toContain("ORDER BY full_name ASC, username ASC");
    expect(normalize(sql)).not.toContain("WHERE");
    expect(values).toEqual([]);
  });

  it("combina filtros de rol y estado como parámetros posicionales", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [operatorRow({ role: "HOUSEKEEPER" })], rowCount: 1 });

    await repository.list({ role: "HOUSEKEEPER", active: false });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(normalize(sql)).toContain("WHERE role = $1 AND active = $2");
    expect(values).toEqual(["HOUSEKEEPER", false]);
  });

  it("lista los bloqueados vigentes", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({
      rows: [operatorRow({ locked_until: new Date("2030-01-01T00:00:00Z") })],
      rowCount: 1,
    });

    const locked = await repository.listLocked();
    expect(locked).toHaveLength(1);
    const [sql] = query.mock.calls[0] as [string];
    expect(normalize(sql)).toContain("locked_until IS NOT NULL AND locked_until > NOW()");
  });

  it("isLocked responde con el criterio de la base y false si no existe", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ locked: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    expect(await repository.isLocked("op-1")).toBe(true);
    expect(await repository.isLocked("op-2")).toBe(false);
    expect(await repository.isLocked("desconocido")).toBe(false);
  });
});

describe("TerminalOperatorsRepository · rotación de PIN", () => {
  it("cambia el PIN, sella la fecha, limpia el bloqueo y resetea los intentos", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({
      rows: [
        operatorRow({
          pin_hash: "$2b$10$nuevo",
          pin_changed_at: new Date("2026-10-11T09:00:00Z"),
          must_change_pin: false,
          failed_attempts: 0,
          locked_until: null,
        }),
      ],
      rowCount: 1,
    });

    const updated = await repository.changePin("11111111-1111-1111-1111-111111111111", {
      pinHash: "$2b$10$nuevo",
    });

    expect(updated.pinHash).toBe("$2b$10$nuevo");
    expect(updated.mustChangePin).toBe(false);
    expect(updated.failedAttempts).toBe(0);
    expect(updated.lockedUntil).toBeNull();

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    const normalized = normalize(sql);
    expect(normalized).toContain("UPDATE terminal_operators");
    expect(normalized).toContain("pin_changed_at = NOW()");
    expect(normalized).toContain("failed_attempts = 0");
    expect(normalized).toContain("locked_until = NULL");
    expect(normalized).toContain("updated_at = NOW()");
    expect(values).toEqual(["11111111-1111-1111-1111-111111111111", "$2b$10$nuevo", false]);
  });

  it("permite forzar must_change_pin en la rotación", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [operatorRow({ must_change_pin: true })], rowCount: 1 });

    await repository.changePin("op-1", { pinHash: "$2b$10$temporal", mustChangePin: true });

    const [, values] = query.mock.calls[0] as [string, unknown[]];
    expect(values).toEqual(["op-1", "$2b$10$temporal", true]);
  });

  it("lanza NOT_FOUND si el operario no existe", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.changePin("nope", { pinHash: "h" })).rejects.toBeInstanceOf(
      TerminalOperatorsError,
    );
    await expect(repository.changePin("nope", { pinHash: "h" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("TerminalOperatorsRepository · intentos fallidos y bloqueo", () => {
  it("bloquea en la quinta intentona con UNA sola sentencia atómica", async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({
      rows: [operatorRow({ failed_attempts: 5, locked_until: lockedUntil })],
      rowCount: 1,
    });

    const result = await repository.registerFailedAttempt("op-1");

    expect(result.locked).toBe(true);
    expect(result.operator.failedAttempts).toBe(5);
    expect(result.operator.lockedUntil).toEqual(lockedUntil);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    const normalized = normalize(sql);
    expect(normalized).toContain("UPDATE terminal_operators");
    expect(normalized).toContain("failed_attempts = failed_attempts + 1");
    expect(normalized).toContain("CASE WHEN failed_attempts + 1 >= $2");
    expect(normalized).toContain("::interval");
    expect(normalized).toContain("updated_at = NOW()");
    expect(values).toEqual(["op-1", 5, 15]);
  });

  it("no marca bloqueado mientras no se alcanza el umbral", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({
      rows: [operatorRow({ failed_attempts: 2, locked_until: null })],
      rowCount: 1,
    });

    const result = await repository.registerFailedAttempt("op-1", { maxAttempts: 5, lockMinutes: 15 });
    expect(result.locked).toBe(false);
    expect(result.operator.failedAttempts).toBe(2);
  });

  it("un bloqueo caducado no cuenta como activo", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({
      rows: [operatorRow({ failed_attempts: 5, locked_until: new Date(Date.now() - 60_000) })],
      rowCount: 1,
    });

    expect((await repository.registerFailedAttempt("op-1")).locked).toBe(false);
  });

  it("lanza NOT_FOUND si el operario no existe", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.registerFailedAttempt("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resetFailedAttempts y unlock dejan el contador a cero y sin bloqueo", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query
      .mockResolvedValueOnce({ rows: [operatorRow({ failed_attempts: 0, locked_until: null })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [operatorRow({ failed_attempts: 0, locked_until: null })], rowCount: 1 });

    expect((await repository.resetFailedAttempts("op-1")).failedAttempts).toBe(0);
    expect((await repository.unlock("op-1")).lockedUntil).toBeNull();

    const [resetSql, resetValues] = query.mock.calls[0] as [string, unknown[]];
    const [unlockSql, unlockValues] = query.mock.calls[1] as [string, unknown[]];
    for (const sql of [resetSql, unlockSql]) {
      const normalized = normalize(sql);
      expect(normalized).toContain("failed_attempts = 0");
      expect(normalized).toContain("locked_until = NULL");
      expect(normalized).toContain("updated_at = NOW()");
    }
    expect(resetValues).toEqual(["op-1"]);
    expect(unlockValues).toEqual(["op-1"]);
  });

  it("resetFailedAttempts lanza NOT_FOUND si no existe la fila", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.resetFailedAttempts("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("TerminalOperatorsRepository · baja y reactivación", () => {
  it("da de baja y reactiva con setActive y sella updated_at", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query
      .mockResolvedValueOnce({ rows: [operatorRow({ active: false })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [operatorRow({ active: true })], rowCount: 1 });

    expect((await repository.setActive("op-1", false)).active).toBe(false);
    expect((await repository.setActive("op-1", true)).active).toBe(true);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(normalize(sql)).toContain("UPDATE terminal_operators");
    expect(normalize(sql)).toContain("SET active = $2, updated_at = NOW()");
    expect(values).toEqual(["op-1", false]);
  });

  it("setActive lanza NOT_FOUND si el operario no existe", async () => {
    const { pool, query } = fakePool();
    const repository = new TerminalOperatorsRepository(pool);
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.setActive("nope", false)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
