import { beforeEach, describe, expect, it, vi } from "vitest";
import { payloadHashOf, type SignatureRecord } from "@hotel/shared";
import { OperationsSignatureError, assertSignatureAuthorizes } from "./signatures";

/**
 * Pruebas de la **puerta de autorización** del flujo de firmas (F4 · T4.5).
 *
 * El caso que fija la prueba nació en la validación E2E contra producción: el worker puede anclar
 * la firma (`SIGNED → MINED`) entre la confirmación y la aplicación del cambio off-chain. La
 * aplicación debe seguir siendo válida (es idempotente), así que `assertSignatureAuthorizes` acepta
 * `SIGNED` y `MINED`, siempre que entidad, acción, payload y rol coincidan.
 */

const ROOM_UUID = "c03d0ba4-d7e1-4102-beb0-5c3ec3413608";
const SIGNATURE_UUID = "f3fd2627-381e-4d1d-950d-fa0f940b9eac";

const payload = { roomId: ROOM_UUID, incidentId: null, reason: "prueba", until: null };

function record(overrides: Partial<SignatureRecord> = {}): SignatureRecord {
  return {
    id: SIGNATURE_UUID,
    entityType: "ROOM_BLOCK",
    entityId: ROOM_UUID,
    eventName: "OperationalAction",
    contentHash: payloadHashOf("ROOM_BLOCK", payload),
    signature: "0x" + "11".repeat(65),
    signerAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    txHash: null,
    status: "SIGNED",
    errorMessage: null,
    nonce: "0x" + "22".repeat(32),
    domainHash: null,
    recoveredSigner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    verifiedAt: new Date(),
    roleSnapshot: "HEAD_MAINTENANCE_ROLE",
    retryCount: 0,
    nextAttemptAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    deadline: new Date(Date.now() + 600_000),
    consumedAt: null,
    createdAt: new Date(),
    minedAt: null,
    ...overrides,
  } as SignatureRecord;
}

function operationsWith(recordValue: SignatureRecord | null) {
  return { findById: vi.fn(async () => recordValue) };
}

const authorize = (status: "SIGNED" | "MINED") =>
  assertSignatureAuthorizes({
    signatureId: SIGNATURE_UUID,
    action: "ROOM_BLOCK",
    entityUuid: ROOM_UUID,
    payload,
    operations: operationsWith(record({ status })) as never,
  });

describe("assertSignatureAuthorizes (F4 · T4.5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acepta una firma SIGNED con entidad, payload y rol correctos", async () => {
    await expect(authorize("SIGNED")).resolves.toMatchObject({ status: "SIGNED" });
  });

  it("acepta una firma MINED (el worker la ancló antes de aplicar el cambio)", async () => {
    await expect(authorize("MINED")).resolves.toMatchObject({ status: "MINED" });
  });

  it("una firma PENDING no autoriza aplicar nada", async () => {
    await expect(authorize("PENDING" as never)).rejects.toMatchObject({ code: "SIGNATURE_NOT_READY" });
  });

  it("una firma de otra entidad se rechaza", async () => {
    await expect(
      assertSignatureAuthorizes({
        signatureId: SIGNATURE_UUID,
        action: "ROOM_UNBLOCK",
        entityUuid: ROOM_UUID,
        payload,
        operations: operationsWith(record()) as never,
      }),
    ).rejects.toMatchObject({ code: "SIGNATURE_ENTITY_MISMATCH" });
  });

  it("un payload distinto (otra habitación/motivo) se rechaza", async () => {
    await expect(
      assertSignatureAuthorizes({
        signatureId: SIGNATURE_UUID,
        action: "ROOM_BLOCK",
        entityUuid: ROOM_UUID,
        payload: { ...payload, reason: "otro motivo" },
        operations: operationsWith(record()) as never,
      }),
    ).rejects.toMatchObject({ code: "SIGNATURE_PAYLOAD_MISMATCH" });
  });

  it("una firma sin el rol de mantenimiento se rechaza", async () => {
    await expect(
      assertSignatureAuthorizes({
        signatureId: SIGNATURE_UUID,
        action: "ROOM_BLOCK",
        entityUuid: ROOM_UUID,
        payload,
        operations: operationsWith(record({ roleSnapshot: "OWNER_BACKUP" })) as never,
      }),
    ).rejects.toBeInstanceOf(OperationsSignatureError);
  });
});
