import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, QueryResultRow } from "pg";
import { RoomMintJobsRepository } from "./room-mint-jobs.repository";

/** Fila de `room_mint_jobs` con los nombres reales de columna. */
function jobRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "job-1",
    room_id: "room-1",
    status: "PENDING",
    attempts: 0,
    content_hash: "0x" + "a".repeat(64),
    signature: null,
    signer_address: null,
    published_by: "admin@hotel.es",
    register_tx_hash: null,
    publish_tx_hash: null,
    mint_tx_hash: null,
    token_id: null,
    last_error: null,
    created_at: new Date("2026-10-21T10:00:00Z"),
    updated_at: new Date("2026-10-21T10:00:00Z"),
    completed_at: null,
    ...overrides,
  };
}

/**
 * Guardián del outbox de publicación (D-85): encolado idempotente, reclamo atómico
 * (`FOR UPDATE SKIP LOCKED`), cierre con rastro on-chain y fallo que deja la habitación en DRAFT.
 */
describe("RoomMintJobsRepository (D-85)", () => {
  let repository: RoomMintJobsRepository;
  let mockPool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() } as Pool & { query: Mock };
    repository = new RoomMintJobsRepository(mockPool);
  });

  it("enqueue inserta el job y mapea la fila", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [jobRow()] });
    const job = await repository.enqueue({
      roomId: "room-1",
      contentHash: "0x" + "a".repeat(64),
      publishedBy: "admin@hotel.es",
    });
    expect(job).toMatchObject({ id: "job-1", roomId: "room-1", status: "PENDING", attempts: 0 });
    expect(String(mockPool.query.mock.calls[0][0])).toContain("ON CONFLICT");
  });

  it("enqueue es idempotente: si ya hay job activo, devuelve el existente", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [jobRow({ id: "job-existing", status: "RUNNING" })] });
    const job = await repository.enqueue({
      roomId: "room-1",
      contentHash: "0x" + "a".repeat(64),
      publishedBy: "admin@hotel.es",
    });
    expect(job.id).toBe("job-existing");
    expect(job.status).toBe("RUNNING");
  });

  it("claimNext reclama con FOR UPDATE SKIP LOCKED y pasa a RUNNING", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [jobRow({ status: "RUNNING", attempts: 1 })] });
    const job = await repository.claimNext();
    expect(job?.status).toBe("RUNNING");
    const sql = String(mockPool.query.mock.calls[0][0]);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("attempts = attempts + 1");
  });

  it("sin jobs pendientes claimNext devuelve null", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect(await repository.claimNext()).toBeNull();
  });

  it("complete guarda el rastro on-chain y marca DONE", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [jobRow({ status: "DONE", completed_at: new Date() })] });
    const job = await repository.complete("job-1", {
      registerTxHash: "0x" + "1".repeat(64),
      publishTxHash: "0x" + "2".repeat(64),
      mintTxHash: "0x" + "3".repeat(64),
      tokenId: "10120261022",
    });
    expect(job?.status).toBe("DONE");
    expect(mockPool.query.mock.calls[0][1]).toEqual([
      "job-1",
      "0x" + "1".repeat(64),
      "0x" + "2".repeat(64),
      "0x" + "3".repeat(64),
      "10120261022",
    ]);
  });

  it("fail guarda el motivo y marca FAILED (la habitación no se publica)", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [jobRow({ status: "FAILED", last_error: "RPC caído" })] });
    const job = await repository.fail("job-1", "RPC caído");
    expect(job).toMatchObject({ status: "FAILED", lastError: "RPC caído" });
    expect(String(mockPool.query.mock.calls[0][0])).toContain("last_error");
  });

  it("listLatestByRooms devuelve el último job por habitación", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [jobRow({ id: "job-1" }), jobRow({ id: "job-2", room_id: "room-2" })],
    });
    const map = await repository.listLatestByRooms(["room-1", "room-2"]);
    expect(map.get("room-1")?.id).toBe("job-1");
    expect(map.get("room-2")?.id).toBe("job-2");
  });

  it("listLatestByRooms sin habitaciones no consulta la base", async () => {
    expect((await repository.listLatestByRooms([])).size).toBe(0);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});
