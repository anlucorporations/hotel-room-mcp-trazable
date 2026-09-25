import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import { PgCheckpointStore } from "./checkpoint-store";

/**
 * Tests de `PgCheckpointStore` (D-09) con un `Pool` de `pg` **mockeado**: no requieren una base
 * de datos real (en CI no hay PostgreSQL), igual que los tests de repositorios de
 * `@hotel/shared`.
 */
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

let mockPool: MockPool;
let store: PgCheckpointStore;

beforeEach(() => {
  mockPool = { query: vi.fn() };
  store = new PgCheckpointStore(mockPool as unknown as Pool);
});

describe("PgCheckpointStore · checkpoint por contrato", () => {
  it("devuelve null si no hay fila para el contrato", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(store.getLastBlock(CONTRACT)).resolves.toBeNull();
    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("worker_checkpoints");
    // La clave canónica es la dirección en minúsculas.
    expect(params).toEqual([CONTRACT.toLowerCase()]);
  });

  it("convierte el BIGINT (string en `pg`) a number", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ last_block: "1234" }] });

    await expect(store.getLastBlock(CONTRACT)).resolves.toBe(1234);
  });

  it("persiste el checkpoint con upsert (normaliza la dirección)", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await store.setLastBlock(CONTRACT, 100);

    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO worker_checkpoints");
    expect(sql).toContain("ON CONFLICT (contract_address)");
    expect(params).toEqual([CONTRACT.toLowerCase(), 100]);
  });
});

describe("PgCheckpointStore · idempotencia (worker_processed_logs)", () => {
  it("isProcessed: false sin fila y true con fila", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await expect(store.isProcessed("0xkey")).resolves.toBe(false);

    mockPool.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    await expect(store.isProcessed("0xkey")).resolves.toBe(true);

    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("worker_processed_logs");
    expect(params).toEqual(["0xkey"]);
  });

  it("markProcessed: insert idempotente (ON CONFLICT DO NOTHING) con metadatos de trazabilidad", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await store.markProcessed("0xkey", {
      blockNumber: 42,
      contractAddress: CONTRACT,
    });

    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO worker_processed_logs");
    expect(sql).toContain("ON CONFLICT (log_key) DO NOTHING");
    expect(params).toEqual(["0xkey", 42, CONTRACT.toLowerCase()]);
  });

  it("markProcessed: sin metadatos persiste NULL (la clave sigue siendo la PK)", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await store.markProcessed("0xkey");

    const [, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(["0xkey", null, null]);
  });
});

describe("PgCheckpointStore · cierre", () => {
  it("close() no cierra el pool compartido (lo hace su propietario)", async () => {
    const end = vi.fn();
    const withEnd = { query: vi.fn(), end } as unknown as Pool;

    await new PgCheckpointStore(withEnd).close();

    expect(end).not.toHaveBeenCalled();
  });
});
