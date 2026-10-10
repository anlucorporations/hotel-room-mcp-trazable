import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { AuditRepository, canonicalJson, computeIntegrityHash } from "./audit.repository";

/**
 * Auditoría de operadores (`operator_audit_log`, RNF-M-19): **append-only** y con **hash encadenado**.
 *
 * Lo que se defiende aquí:
 *   1. El hash es **determinista**: mismo contenido y mismo eslabón anterior ⇒ mismo hash, con las
 *      claves de un objeto JSON en cualquier orden. Sin esto, `verifyChain` no detectaría nada.
 *   2. La inserción va **encadenada y serializada**: `pg_advisory_xact_lock` dentro de la transacción
 *      (dos auditorías concurrentes no pueden bifurcar la cadena).
 *   3. `verifyChain` detecta manipulación: un `prev_hash` roto, un `integrity_hash` recalculado o una
 *      fila cambiada por detrás se reportan con el id exacto del eslabón roto.
 */

function auditRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "aud-1",
    actor_username: "jefa.mantenimiento",
    actor_role: "HEAD_MAINTENANCE",
    entity_type: "ROOM_BLOCK",
    entity_id: "11111111-1111-1111-1111-111111111111",
    action: "BLOCK",
    old_value: null,
    new_value: { reason: "fuga" },
    terminal_id: null,
    prev_hash: null,
    integrity_hash: "0x" + "a".repeat(64),
    created_at: new Date("2026-10-10T08:00:00Z"),
    ...overrides,
  };
}

/** Pool doble con cliente transaccional: enruta por palabra clave del SQL. */
function fakePool(handlers: {
  head?: QueryResultRow | null;
  insert?: QueryResultRow;
  list?: QueryResultRow[];
  chain?: QueryResultRow[];
}) {
  const clientQuery = vi.fn(async (sql: string) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.includes("SELECT integrity_hash FROM operator_audit_log")) {
      return { rows: handlers.head === undefined ? [] : handlers.head === null ? [] : [handlers.head] };
    }
    if (sql.includes("INSERT INTO operator_audit_log")) {
      return { rows: [handlers.insert ?? auditRow()] };
    }
    return { rows: [] };
  });
  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("ORDER BY created_at ASC")) return { rows: handlers.chain ?? [] };
    return { rows: handlers.list ?? [] };
  });
  const pool = {
    connect: vi.fn(async () => client),
    query,
  } as unknown as Pool;
  return { pool, query, clientQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canonicalJson · hash determinista", () => {
  it("ordena las claves en profundidad (mismo contenido, distinto orden ⇒ mismo texto)", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });

  it("ignora las claves indefinidas y distingue `null` de ausente", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });

  it("el hash encadena con el anterior y cambia si cambia el contenido", () => {
    const prev = "0x" + "b".repeat(64);
    const uno = computeIntegrityHash(prev, { action: "BLOCK" });
    const dos = computeIntegrityHash(prev, { action: "BLOCK" });
    const otro = computeIntegrityHash(prev, { action: "UNBLOCK" });
    const sinPrev = computeIntegrityHash(null, { action: "BLOCK" });

    expect(uno).toBe(dos);
    expect(uno).not.toBe(otro);
    expect(uno).not.toBe(sinPrev);
    expect(uno).toMatch(/^0x[0-9a-f]{64}$/); // VARCHAR(66) del esquema
  });
});

describe("AuditRepository.append", () => {
  it("encadena con el último eslabón y guarda el hash calculado", async () => {
    const prev = "0x" + "c".repeat(64);
    const { pool, clientQuery } = fakePool({ head: { integrity_hash: prev } });
    const repo = new AuditRepository(pool);

    const entry = {
      actorUsername: "jefa.mantenimiento",
      actorRole: "HEAD_MAINTENANCE",
      entityType: "ROOM_BLOCK",
      entityId: "11111111-1111-1111-1111-111111111111",
      action: "BLOCK",
      newValue: { reason: "fuga" },
    };

    const guardado = await repo.append(entry);

    expect(guardado.id).toBe("aud-1");
    const insert = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO operator_audit_log"));
    expect(insert, "no se insertó la entrada").toBeDefined();
    const params = insert![1] as unknown[];
    expect(params[8]).toBe(prev); // prev_hash = eslabón anterior
    expect(params[9]).toBe(computeIntegrityHash(prev, { ...entry, entityId: entry.entityId, oldValue: null, newValue: { reason: "fuga" }, terminalId: null }));
    // La cadena se serializa con el cerrojo de aviso dentro de la transacción.
    const sqls = clientQuery.mock.calls.map(([sql]) => String(sql));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.some((s) => s.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(sqls).toContain("COMMIT");
  });

  it("la primera entrada de la cadena no tiene eslabón anterior", async () => {
    const { pool, clientQuery } = fakePool({ head: null });
    const repo = new AuditRepository(pool);

    await repo.append({ actorUsername: "a", actorRole: "HEAD_KEEPER", entityType: "INSPECTION", action: "INSPECT" });

    const insert = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO operator_audit_log"));
    expect((insert![1] as unknown[])[8]).toBeNull();
    expect((insert![1] as unknown[])[9]).toBe(computeIntegrityHash(null, {
      actorUsername: "a", actorRole: "HEAD_KEEPER", entityType: "INSPECTION", entityId: null,
      action: "INSPECT", oldValue: null, newValue: null, terminalId: null,
    }));
  });

  it("si la inserción falla, hace ROLLBACK y propaga el error (el cerrojo se libera solo)", async () => {
    const { pool, clientQuery } = fakePool({ head: null });
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("INSERT")) throw new Error("violación de CHECK");
      return { rows: [] };
    });
    const repo = new AuditRepository(pool);

    await expect(
      repo.append({ actorUsername: "a", actorRole: "HEAD_KEEPER", entityType: "INSPECTION", action: "INSPECT" }),
    ).rejects.toThrow("violación de CHECK");
    expect(clientQuery.mock.calls.map(([sql]) => String(sql))).toContain("ROLLBACK");
  });
});

describe("AuditRepository.list", () => {
  it("limita y filtra por entidad", async () => {
    const { pool, query } = fakePool({ list: [auditRow()] });
    const repo = new AuditRepository(pool);

    const entradas = await repo.list({ limit: 10, entityType: "ROOM_BLOCK", entityId: "id-1" });

    expect(entradas).toHaveLength(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(String(sql)).toContain("entity_type = $1");
    expect(String(sql)).toContain("entity_id = $2");
    expect(params).toEqual(["ROOM_BLOCK", "id-1", 10]);
  });

  it("acota el límite a un rango sensato (no permite volcar la tabla)", async () => {
    const { pool, query } = fakePool({ list: [] });
    const repo = new AuditRepository(pool);

    await repo.list({ limit: 99_999 });
    expect((query.mock.calls[0]![1] as unknown[])[0]).toBe(1_000);

    await repo.list({ limit: 0 });
    expect((query.mock.calls[1]![1] as unknown[])[0]).toBe(1);
  });
});

describe("AuditRepository.verifyChain", () => {
  function chainOf(contents: Record<string, unknown>[]): QueryResultRow[] {
    let prev: string | null = null;
    return contents.map((content, index) => {
      // El hash se calcula EXACTAMENTE como lo hace `append`: sobre los ocho campos que se guardan
      // (los ausentes, como `null`). Calcularlo sobre un objeto parcial daría una cadena que
      // `verifyChain` rechazaría, que es justo lo que la prueba no debe provocar por error.
      const row = auditRow({
        id: `aud-${index + 1}`,
        actor_username: content.actorUsername,
        actor_role: content.actorRole,
        entity_type: content.entityType,
        entity_id: content.entityId ?? null,
        action: content.action,
        old_value: content.oldValue ?? null,
        new_value: content.newValue ?? null,
        terminal_id: content.terminalId ?? null,
        prev_hash: prev,
      });
      const integrity = computeIntegrityHash(prev, {
        actorUsername: row.actor_username,
        actorRole: row.actor_role,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        oldValue: row.old_value,
        newValue: row.new_value,
        terminalId: row.terminal_id,
      });
      prev = integrity;
      return { ...row, integrity_hash: integrity };
    });
  }

  const base = { actorUsername: "a", actorRole: "HEAD_KEEPER", entityType: "INSPECTION", action: "INSPECT" };

  it("una cadena intacta cuadra y cuenta todas las entradas", async () => {
    const { pool } = fakePool({ chain: chainOf([base, { ...base, action: "APPROVE" }]) });
    const repo = new AuditRepository(pool);

    expect(await repo.verifyChain()).toEqual({ ok: true, checked: 2 });
  });

  it("una cadena vacía también es válida", async () => {
    const { pool } = fakePool({ chain: [] });
    expect(await new AuditRepository(pool).verifyChain()).toEqual({ ok: true, checked: 0 });
  });

  it("detecta que alguien reescribió el contenido de una entrada", async () => {
    const rows = chainOf([base, { ...base, action: "APPROVE" }]);
    rows[0] = { ...rows[0]!, action: "INSPECT_MANIPULADO" }; // el hash ya no cuadra
    const { pool } = fakePool({ chain: rows });

    const resultado = await new AuditRepository(pool).verifyChain();

    expect(resultado.ok).toBe(false);
    expect(resultado.brokenAt).toBe("aud-1");
    expect(resultado.reason).toContain("integrity_hash");
  });

  it("detecta un eslabón borrado (el prev_hash del siguiente ya no apunta al anterior)", async () => {
    const rows = chainOf([base, { ...base, action: "APPROVE" }]);
    const { pool } = fakePool({ chain: [rows[1]!] }); // se elimina el primer eslabón

    const resultado = await new AuditRepository(pool).verifyChain();

    expect(resultado.ok).toBe(false);
    expect(resultado.reason).toContain("prev_hash");
  });
});
