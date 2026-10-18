import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorableSignature, AnchorRelayer } from "./anchor-relayer";
import { UnanchorableActionError } from "./anchor-relayer";
import type { AnchorOutboxRepository, OutboxSignature } from "./anchor-outbox";
import { AnchorOutbox } from "./anchor-outbox";

/**
 * Motor del outbox de anclaje (T3.2). Sin Postgres ni Anvil: repositorio y relayer son dobles de
 * vitest y el reloj se inyecta, de modo que se verifica el **valor exacto** del backoff, del TTL y
 * de la transición terminal sin esperar tiempo real.
 */
const NOW = new Date("2026-10-20T12:00:00Z");
const HOUR_MS = 3_600_000;
const TX = `0x${"ab".repeat(32)}` as const;
const TX2 = `0x${"cd".repeat(32)}` as const;
const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const NONCE = "0x9c6230254ac733f54ec47298f0a5ddaf93dc9efe6e05fb726dcb6faf10ddece2";
const PAYLOAD = "0x5031c2aa46e9edd122f1853ee43724012c7e9956883c1f0c32a71c0abd9f9a39";
const SIGNATURE = `0x${"11".repeat(65)}`;
const SIGNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function makeSignature(overrides: Partial<OutboxSignature> = {}): OutboxSignature {
  return {
    id: "sig-1",
    entityType: "ROOM_BLOCK",
    entityId: UUID,
    contentHash: PAYLOAD,
    nonce: NONCE,
    deadline: new Date(NOW.getTime() + HOUR_MS),
    signature: SIGNATURE,
    txHash: null,
    signerAddress: SIGNER,
    retryCount: 0,
    nextAttemptAt: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    expiresAt: null,
    ...overrides,
  };
}

type ClaimOptions = { now?: Date; limit?: number; leaseSeconds?: number } | undefined;

class FakeRepository implements AnchorOutboxRepository {
  claimed: OutboxSignature[] = [];
  claimOptions: ClaimOptions;
  claimCalls = 0;
  readonly markMined = vi.fn(async (_id: string, _txHash: string) => undefined);
  readonly markFailed = vi.fn(
    async (_id: string, _message: string, _next: Date | null) => undefined,
  );
  readonly recoverAfterRestart = vi.fn(async (_now?: Date) => ({
    requeued: 2,
    expired: 1,
  }));
  readonly expireStale = vi.fn(async (_now?: Date) => 0);

  async claimForAnchoring(options?: ClaimOptions): Promise<OutboxSignature[]> {
    this.claimCalls += 1;
    this.claimOptions = options;
    return this.claimed;
  }

  async findById(id: string): Promise<OutboxSignature | null> {
    return this.claimed.find((s) => s.id === id) ?? null;
  }
}

class FakeRelayer implements AnchorRelayer {
  readonly anchor = vi.fn(async (_signature: AnchorableSignature) => ({ txHash: TX }));
  readonly isMined = vi.fn(async (_txHash: `0x${string}`) => false);
}

interface Harness {
  readonly repository: FakeRepository;
  readonly relayer: FakeRelayer;
  readonly outbox: AnchorOutbox;
}

function build(options: {
  claimed?: OutboxSignature[];
  now?: Date;
  backoffSeconds?: readonly number[];
  maxRetries?: number;
  ttlHours?: number;
  logger?: ConstructorParameters<typeof AnchorOutbox>[0]["logger"];
}): Harness {
  const repository = new FakeRepository();
  repository.claimed = options.claimed ?? [];
  const relayer = new FakeRelayer();
  const outbox = new AnchorOutbox({
    repository,
    relayer,
    logger: options.logger,
    options: {
      now: () => options.now ?? NOW,
      ...(options.backoffSeconds ? { backoffSeconds: options.backoffSeconds } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.ttlHours !== undefined ? { ttlHours: options.ttlHours } : {}),
    },
  });
  return { repository, relayer, outbox };
}

describe("AnchorOutbox · camino feliz e idempotencia (T3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reclama, ancla y marca MINED; recupera en el primer arranque y expira TTL", async () => {
    const h = build({ claimed: [makeSignature()] });

    const result = await h.outbox.runOnce();

    expect(result).toEqual({
      recovered: { requeued: 2, expired: 1 },
      claimed: 1,
      mined: 1,
      failed: 0,
      errors: 0,
    });
    expect(h.relayer.anchor).toHaveBeenCalledTimes(1);
    expect(h.repository.markMined).toHaveBeenCalledWith("sig-1", TX);
    expect(h.repository.expireStale).toHaveBeenCalledWith(NOW);
    expect(h.repository.claimOptions).toEqual({ now: NOW, limit: 10, leaseSeconds: 120 });
    expect(h.repository.recoverAfterRestart).toHaveBeenCalledTimes(1);
  });

  it("no reenvía una tx ya minada: `isMined` true ⇒ marca MINED con el txHash existente", async () => {
    const h = build({ claimed: [makeSignature({ txHash: TX2 })] });
    h.relayer.isMined.mockResolvedValue(true);

    const result = await h.outbox.runOnce();

    expect(result.mined).toBe(1);
    expect(h.relayer.isMined).toHaveBeenCalledWith(TX2);
    expect(h.relayer.anchor).not.toHaveBeenCalled();
    expect(h.repository.markMined).toHaveBeenCalledWith("sig-1", TX2);
  });

  it("si la tx existente no está minada, sí la reenvía", async () => {
    const h = build({ claimed: [makeSignature({ txHash: TX2 })] });
    h.relayer.isMined.mockResolvedValue(false);

    const result = await h.outbox.runOnce();

    expect(result.mined).toBe(1);
    expect(h.relayer.anchor).toHaveBeenCalledTimes(1);
    expect(h.repository.markMined).toHaveBeenCalledWith("sig-1", TX);
  });

  it("un lote vacío no ancla nada y no falla", async () => {
    const h = build({ claimed: [] });
    const result = await h.outbox.runOnce();
    expect(result.claimed).toBe(0);
    expect(result.mined).toBe(0);
    expect(h.relayer.anchor).not.toHaveBeenCalled();
  });
});

describe("AnchorOutbox · backoff, TTL y transición terminal (RNF-M-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reprograma con backoff exacto 30→60→120→300→600 s y lo satura", async () => {
    const expected = [30, 60, 120, 300, 600, 600, 600];
    for (let retryCount = 0; retryCount < expected.length; retryCount += 1) {
      const h = build({ claimed: [makeSignature({ retryCount })] });
      h.relayer.anchor.mockRejectedValue(new Error("RPC caído"));

      const result = await h.outbox.runOnce();

      expect(result).toMatchObject({ claimed: 1, mined: 0, failed: 1, errors: 1 });
      expect(h.repository.markFailed).toHaveBeenCalledWith(
        "sig-1",
        "RPC caído",
        new Date(NOW.getTime() + (expected[retryCount] ?? 0) * 1000),
      );
    }
  });

  it("al alcanzar maxRetries (8 intentos) marca FAILED terminal sin nextAttemptAt", async () => {
    const h = build({ claimed: [makeSignature({ retryCount: 7 })] });
    h.relayer.anchor.mockRejectedValue(new Error("RPC caído"));

    const result = await h.outbox.runOnce();

    expect(result.failed).toBe(1);
    expect(h.repository.markFailed).toHaveBeenCalledWith("sig-1", "RPC caído", null);
  });

  it("una firma con 24 h o más de antigüedad es terminal aunque le queden reintentos", async () => {
    const h = build({
      claimed: [
        makeSignature({
          retryCount: 0,
          createdAt: new Date(NOW.getTime() - (24 * HOUR_MS + 1000)),
        }),
      ],
    });
    h.relayer.anchor.mockRejectedValue(new Error("RPC caído"));

    const result = await h.outbox.runOnce();

    expect(result.failed).toBe(1);
    expect(h.repository.markFailed).toHaveBeenCalledWith("sig-1", "RPC caído", null);
  });

  it("justo por debajo del TTL sigue reintentando con backoff", async () => {
    const h = build({
      claimed: [
        makeSignature({
          retryCount: 0,
          createdAt: new Date(NOW.getTime() - (24 * HOUR_MS - 60_000)),
        }),
      ],
    });
    h.relayer.anchor.mockRejectedValue(new Error("RPC caído"));

    await h.outbox.runOnce();

    expect(h.repository.markFailed).toHaveBeenCalledWith(
      "sig-1",
      "RPC caído",
      new Date(NOW.getTime() + 30_000),
    );
  });

  it("UnanchorableActionError es terminal de inmediato con motivo explícito", async () => {
    const h = build({ claimed: [makeSignature({ entityType: "AREA_LOG" })] });
    h.relayer.anchor.mockRejectedValue(new UnanchorableActionError("AREA_LOG"));

    const result = await h.outbox.runOnce();

    expect(result).toMatchObject({ mined: 0, failed: 1, errors: 1 });
    expect(h.repository.markFailed).toHaveBeenCalledWith(
      "sig-1",
      expect.stringContaining("UNANCHORABLE_ACTION"),
      null,
    );
  });

  it("un fallo no detiene el lote (aislamiento): 2 ancladas, 1 fallida", async () => {
    const h = build({
      claimed: [
        makeSignature({ id: "sig-1" }),
        makeSignature({ id: "sig-2" }),
        makeSignature({ id: "sig-3" }),
      ],
    });
    h.relayer.anchor.mockImplementation(async (signature: AnchorableSignature) => {
      if (signature.id === "sig-2") throw new Error("boom");
      return { txHash: TX };
    });

    const result = await h.outbox.runOnce();

    expect(result).toEqual({
      recovered: { requeued: 2, expired: 1 },
      claimed: 3,
      mined: 2,
      failed: 1,
      errors: 1,
    });
    expect(h.repository.markMined).toHaveBeenCalledTimes(2);
    expect(h.repository.markFailed).toHaveBeenCalledTimes(1);
  });

  it("si marcar el fallo también falla, el lote continúa (aislamiento doble)", async () => {
    const h = build({
      claimed: [makeSignature({ id: "sig-1" }), makeSignature({ id: "sig-2" })],
    });
    h.relayer.anchor.mockImplementation(async (signature: AnchorableSignature) => {
      if (signature.id === "sig-1") throw new Error("boom");
      return { txHash: TX };
    });
    h.repository.markFailed.mockRejectedValue(new Error("DB caída"));

    const result = await h.outbox.runOnce();

    expect(result.claimed).toBe(2);
    expect(result.mined).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toBe(1);
  });

  it("traza las decisiones sin PII (solo id, entityType, retryCount y nextAttemptAt)", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const h = build({ claimed: [makeSignature({ retryCount: 7 })], logger });
    h.relayer.anchor.mockRejectedValue(new Error("RPC caído"));

    await h.outbox.runOnce();

    expect(logger.error).toHaveBeenCalledWith(
      { id: "sig-1", entityType: "ROOM_BLOCK", retryCount: 7, nextAttemptAt: null },
      "outbox: reintentos o TTL agotados → FAILED terminal (reintento manual)",
    );
    const trace = logger.error.mock.calls[0]?.[0] as Record<string, unknown>;
    for (const forbidden of ["entityId", "contentHash", "signature", "nonce", "signerAddress"]) {
      expect(trace).not.toHaveProperty(forbidden);
    }
  });
});

describe("AnchorOutbox · recuperación de arranque (RNF-M-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recoverAfterRestart se llama una sola vez aunque corran varias pasadas", async () => {
    const h = build({ claimed: [] });

    const first = await h.outbox.runOnce();
    const second = await h.outbox.runOnce();
    const explicit = await h.outbox.recover();

    expect(first.recovered).toEqual({ requeued: 2, expired: 1 });
    expect(second.recovered).toEqual({ requeued: 0, expired: 0 });
    expect(explicit).toEqual({ requeued: 0, expired: 0 });
    expect(h.repository.recoverAfterRestart).toHaveBeenCalledTimes(1);
  });

  it("skipRecovery pospone la recuperación al siguiente runOnce", async () => {
    const h = build({ claimed: [] });

    const skipped = await h.outbox.runOnce({ skipRecovery: true });
    expect(skipped.recovered).toEqual({ requeued: 0, expired: 0 });
    expect(h.repository.recoverAfterRestart).not.toHaveBeenCalled();

    await h.outbox.runOnce();
    expect(h.repository.recoverAfterRestart).toHaveBeenCalledTimes(1);
  });

  it("expira el TTL en cada pasada y reclama con el lease configurado", async () => {
    const h = build({ claimed: [] });
    await h.outbox.runOnce();
    await h.outbox.runOnce();
    expect(h.repository.expireStale).toHaveBeenCalledTimes(2);
    expect(h.repository.claimCalls).toBe(2);
    expect(h.repository.claimOptions).toEqual({ now: NOW, limit: 10, leaseSeconds: 120 });
  });

  it("respeta batchSize y leaseSeconds inyectados", async () => {
    const repository = new FakeRepository();
    const relayer = new FakeRelayer();
    const outbox = new AnchorOutbox({
      repository,
      relayer,
      options: { now: () => NOW, batchSize: 3, leaseSeconds: 45 },
    });
    await outbox.runOnce();
    expect(repository.claimOptions).toEqual({ now: NOW, limit: 3, leaseSeconds: 45 });
  });
});
