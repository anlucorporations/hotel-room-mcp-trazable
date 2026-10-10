import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, QueryResultRow } from "pg";
import {
  OperationsError,
  OperationsRepository,
  buildSignatureNonce,
} from "./operations.repository";

/**
 * Operaciones firmadas (`operator_wallets` + `on_chain_signatures`, F2/F3 · D-C16, D-C18, D-C42).
 *
 * Lo que se defiende aquí:
 *   1. **Anti-replay (DT-AUD-04):** el nonce es determinista por `(firmante, contenido)`, así que la
 *      MISMA operación no puede firmarse dos veces; el índice único parcial de la base lo respalda.
 *   2. **El firmante recuperado manda (D-C16/H-10):** una firma de otra cartera NO se marca `SIGNED`
 *      —se rechaza—, y una fila ya firmada no se re-firma.
 *   3. **Ciclo de vida del outbox:** `PENDING → SIGNED → MINED`, con `FAILED` + `retry_count` +
 *      `next_attempt_at` para el reintento, `REVOKED` para lo que ya no aplica y `consume` de un solo
 *      uso sobre lo que está en la cadena.
 *   4. **Wallets:** alta/rotación (reactiva la revocada), baja y consulta por rol.
 */

function walletRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "wal-1",
    admin_user_id: "usr-1",
    username: "jefa.mantenimiento",
    role: "HEAD_MAINTENANCE",
    wallet_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    is_active: true,
    assigned_by: "owner",
    assigned_at: new Date("2026-10-10T07:00:00Z"),
    revoked_at: null,
    backup_for_role: null,
    ...overrides,
  };
}

function signatureRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "sig-1",
    entity_type: "ROOM_BLOCK",
    entity_id: "11111111-1111-1111-1111-111111111111",
    event_name: "OperationalAction",
    content_hash: "0x" + "1".repeat(64),
    signature: null,
    signer_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    tx_hash: null,
    status: "PENDING",
    error_message: null,
    nonce: null,
    domain_hash: null,
    recovered_signer: null,
    verified_at: null,
    role_snapshot: null,
    retry_count: 0,
    next_attempt_at: null,
    consumed_at: null,
    created_at: new Date("2026-10-10T08:00:00Z"),
    mined_at: null,
    ...overrides,
  };
}

/** Pool doble que enruta por palabra clave y permite fijar la respuesta por prueba. */
function fakePool() {
  const query = vi.fn(async () => ({ rows: [] as QueryResultRow[] }));
  return { pool: { query } as unknown as Pool, query };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSignatureNonce · anti-replay", () => {
  it("es determinista para el mismo firmante y contenido, sin depender de mayúsculas", () => {
    const a = buildSignatureNonce("0xABC", "0x" + "2".repeat(64));
    const b = buildSignatureNonce("0xabc", "0x" + "2".repeat(64));
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("cambia si cambia el contenido o el firmante", () => {
    const base = buildSignatureNonce("0xabc", "0xaa");
    expect(base).not.toBe(buildSignatureNonce("0xabc", "0xbb"));
    expect(base).not.toBe(buildSignatureNonce("0xdef", "0xaa"));
  });
});

describe("OperationsRepository · wallets", () => {
  it("asigna wallet y reactiva una revocada (rotación sin perder el histórico)", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [walletRow()] });
    const repo = new OperationsRepository(pool);

    const wallet = await repo.assignWallet({
      username: "jefa.mantenimiento",
      role: "HEAD_MAINTENANCE",
      walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      assignedBy: "owner",
      adminUserId: "usr-1",
    });

    expect(wallet.role).toBe("HEAD_MAINTENANCE");
    const [sql, params] = query.mock.calls[0]!;
    expect(String(sql)).toContain("ON CONFLICT (username) DO UPDATE");
    expect(String(sql)).toContain("revoked_at = NULL");
    expect(params).toEqual([
      "jefa.mantenimiento",
      "HEAD_MAINTENANCE",
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "owner",
      "usr-1",
      null,
    ]);
  });

  it("la baja marca la fecha y solo afecta a la wallet activa", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [walletRow({ is_active: false, revoked_at: new Date() })] });
    const repo = new OperationsRepository(pool);

    const revocada = await repo.revokeWallet("jefa.mantenimiento");

    expect(revocada?.isActive).toBe(false);
    expect(String(query.mock.calls[0]![0])).toContain("WHERE username = $1 AND is_active = TRUE");
  });

  it("una baja que no encuentra wallet activa devuelve null (idempotente)", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [] });
    expect(await new OperationsRepository(pool).revokeWallet("nadie")).toBeNull();
  });

  it("busca la wallet activa del rol ignorando las revocadas", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [] });
    await new OperationsRepository(pool).findActiveWallet("HEAD_KEEPER");

    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toContain("role = $1 AND is_active = TRUE AND revoked_at IS NULL");
  });
});

describe("OperationsRepository · outbox de firmas", () => {
  it("registra la intención con nonce derivado del contenido (no aleatorio)", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [signatureRow()] });
    const repo = new OperationsRepository(pool);
    const contentHash = "0x" + "1".repeat(64);
    const signer = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    await repo.createSignatureRequest({
      entityType: "ROOM_BLOCK",
      entityId: "11111111-1111-1111-1111-111111111111",
      eventName: "OperationalAction",
      contentHash,
      signerAddress: signer,
    });

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params[5]).toBe(buildSignatureNonce(signer, contentHash));
    expect(params[6]).toBeNull(); // expires_at
    expect(params[7]).toBeNull(); // deadline
    expect(String(query.mock.calls[0]![0])).toContain("'PENDING'");
  });

  it("marca SIGNED cuando la firma la recuperó la wallet asignada", async () => {
    const { pool, query } = fakePool();
    query
      .mockResolvedValueOnce({ rows: [signatureRow()] }) // findById
      .mockResolvedValueOnce({ rows: [signatureRow({ status: "SIGNED", recovered_signer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" })] });
    const repo = new OperationsRepository(pool);

    const firmada = await repo.markSigned("sig-1", {
      signature: "0xsig",
      recoveredSigner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      domainHash: "0x" + "3".repeat(64),
      roleSnapshot: "HEAD_MAINTENANCE",
    });

    expect(firmada?.status).toBe("SIGNED");
    expect(String(query.mock.calls[1]![0])).toContain("WHERE id = $1 AND status = 'PENDING'");
  });

  it("RECHAZA una firma recuperada por otra cartera (H-10) y no toca la base", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValueOnce({ rows: [signatureRow()] });
    const repo = new OperationsRepository(pool);

    await expect(
      repo.markSigned("sig-1", {
        signature: "0xsig",
        recoveredSigner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // otra cuenta
        domainHash: "0x" + "3".repeat(64),
        roleSnapshot: "HEAD_MAINTENANCE",
      }),
    ).rejects.toThrow(OperationsError);
    expect(query).toHaveBeenCalledTimes(1); // solo el SELECT de comprobación
  });

  it("no re-firma una fila ya firmada", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValueOnce({ rows: [signatureRow({ recovered_signer: "0xabc" })] });
    const repo = new OperationsRepository(pool);

    expect(
      await repo.markSigned("sig-1", {
        signature: "0xotra",
        recoveredSigner: "0xabc",
        domainHash: "0x" + "4".repeat(64),
        roleSnapshot: "HEAD_KEEPER",
      }),
    ).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("el fallo de anclaje cuenta el intento y programa el siguiente", async () => {
    const { pool, query } = fakePool();
    const next = new Date("2026-10-10T09:00:00Z");
    query.mockResolvedValue({ rows: [signatureRow({ status: "FAILED", retry_count: 1, next_attempt_at: next })] });
    const repo = new OperationsRepository(pool);

    const fallida = await repo.markFailed("sig-1", "nonce too low", next);

    expect(fallida?.retryCount).toBe(1);
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toContain("retry_count = retry_count + 1");
    expect((query.mock.calls[0]![1] as unknown[])[2]).toBe(next);
  });

  it("solo se consume (un solo uso) lo que ya está en la cadena", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [] });
    await new OperationsRepository(pool).consume("sig-1");

    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toContain("status = 'MINED' AND consumed_at IS NULL");
  });

  it("la cola de reintento solo trae pendientes vencidas, de la más antigua a la más nueva", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [signatureRow()] });
    const now = new Date("2026-10-10T10:00:00Z");

    const cola = await new OperationsRepository(pool).findPendingForRetry(now, 5);

    expect(cola).toHaveLength(1);
    const sql = String(query.mock.calls[0]![0]);
    expect(sql).toContain("status IN ('PENDING', 'SIGNED')");
    expect(sql).toContain("consumed_at IS NULL");
    expect(sql).toContain("next_attempt_at IS NULL OR next_attempt_at <= $1");
    expect(sql).toContain("ORDER BY created_at ASC");
    expect(query.mock.calls[0]![1]).toEqual([now, 5]);
  });

  it("revoca lo que ya no aplica (solo PENDING o FAILED)", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [signatureRow({ status: "REVOKED" })] });
    const revocada = await new OperationsRepository(pool).revoke("sig-1", "el bloqueo se deshizo");

    expect(revocada?.status).toBe("REVOKED");
    expect(String(query.mock.calls[0]![0])).toContain("status IN ('PENDING', 'FAILED')");
  });

  it("lista las firmas de una entidad para la ficha de la habitación", async () => {
    const { pool, query } = fakePool();
    query.mockResolvedValue({ rows: [signatureRow(), signatureRow({ id: "sig-2", status: "MINED" })] });

    const firmas = await new OperationsRepository(pool).listByEntity(
      "ROOM_BLOCK",
      "11111111-1111-1111-1111-111111111111",
    );

    expect(firmas).toHaveLength(2);
    expect(String(query.mock.calls[0]![0])).toContain("entity_type = $1 AND entity_id = $2");
  });
});
