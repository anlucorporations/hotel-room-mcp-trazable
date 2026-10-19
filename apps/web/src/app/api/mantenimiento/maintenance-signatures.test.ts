import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import { payloadHashOf } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockOps, mockMaintenance } = vi.hoisted(() => ({
  mockOps: {
    findActiveWallet: vi.fn(),
    createSignatureRequest: vi.fn(),
    findById: vi.fn(),
    markSigned: vi.fn(),
  },
  mockMaintenance: {
    blockRoomWithSignature: vi.fn(),
    unblockRoomWithSignature: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    OperationsRepository: vi.fn(() => mockOps),
    MaintenanceRepository: vi.fn(() => mockMaintenance),
    recoverOperationalSigner: vi.fn(),
  };
});

import { POST as prepareSignature } from "./signatures/route";
import { PATCH as confirmSignature } from "./signatures/[id]/route";
import { POST as blockRoom } from "./rooms/[id]/block/route";
import { POST as unblockRoom } from "./rooms/[id]/unblock/route";

const ROOM_UUID = "c03d0ba4-d7e1-4102-beb0-5c3ec3413608";
const SIGNATURE_UUID = "f3fd2627-381e-4d1d-950d-fa0f940b9eac";
const WALLET = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CONTRACT = "0x222d74f33b0d07687a769a44399e2272a4cb9ffe";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

function signatureRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SIGNATURE_UUID,
    entityType: "ROOM_BLOCK",
    entityId: ROOM_UUID,
    eventName: "OperationalAction",
    contentHash: "0x" + "11".repeat(32),
    signature: null,
    signerAddress: WALLET,
    txHash: null,
    status: "PENDING",
    errorMessage: null,
    nonce: "0x" + "22".repeat(32),
    domainHash: null,
    recoveredSigner: null,
    verifiedAt: null,
    roleSnapshot: null,
    retryCount: 0,
    nextAttemptAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    deadline: new Date(Date.now() + 600_000),
    consumedAt: null,
    createdAt: new Date(),
    minedAt: null,
    ...overrides,
  };
}

describe("API de firmas de mantenimiento (F4 · T4.4/T4.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS = CONTRACT;
    mockOps.findActiveWallet.mockResolvedValue({
      id: "w-1",
      adminUserId: null,
      username: "jefe@hotel.es",
      role: "HEAD_MAINTENANCE",
      walletAddress: WALLET,
      isActive: true,
      assignedBy: "admin@hotel.es",
      assignedAt: new Date(),
      revokedAt: null,
      backupForRole: null,
    });
    mockOps.createSignatureRequest.mockResolvedValue(signatureRow());
  });

  it("prepara el TypedData con el dominio HotelOperations y la red activa", async () => {
    const res = await prepareSignature(
      jsonRequest("http://localhost/api/mantenimiento/signatures", {
        action: "ROOM_BLOCK",
        roomId: ROOM_UUID,
        reason: "Fuga",
        until: "2026-10-25",
        signerAddress: WALLET,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.signatureId).toBe(SIGNATURE_UUID);
    expect(body.typedData.domain.name).toBe("HotelOperations");
    expect(body.typedData.primaryType).toBe("OperationalAction");
    expect(body.typedData.message.deadline).toMatch(/^[0-9]+$/);
    expect(lastRequiredRole()).toEqual(["HEAD_MAINTENANCE", "DEFAULT_ADMIN_ROLE"]);
    expect(mockOps.createSignatureRequest).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "ROOM_BLOCK", entityId: ROOM_UUID, signerAddress: WALLET }),
    );
  });

  it("sin contrato de operaciones responde 503 (no inventa dominio)", async () => {
    delete process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS;
    const res = await prepareSignature(
      jsonRequest("http://localhost/api/mantenimiento/signatures", {
        action: "ROOM_BLOCK",
        roomId: ROOM_UUID,
        signerAddress: WALLET,
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("OPERATIONS_NOT_CONFIGURED");
  });

  it("rechaza acciones fuera del vocabulario y firmantes mal formados", async () => {
    const badAction = await prepareSignature(
      jsonRequest("http://localhost/api/mantenimiento/signatures", {
        action: "ROOM_DELETE",
        roomId: ROOM_UUID,
        signerAddress: WALLET,
      }),
    );
    expect(badAction.status).toBe(400);

    const badSigner = await prepareSignature(
      jsonRequest("http://localhost/api/mantenimiento/signatures", {
        action: "ROOM_BLOCK",
        roomId: ROOM_UUID,
        signerAddress: "no-es-direccion",
      }),
    );
    expect(badSigner.status).toBe(400);
  });

  it("confirma una firma: recupera el firmante y marca SIGNED", async () => {
    const shared = await import("@hotel/shared");
    (shared.recoverOperationalSigner as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(WALLET);
    mockOps.findById.mockResolvedValue(signatureRow());
    mockOps.markSigned.mockResolvedValue(signatureRow({ status: "SIGNED", recoveredSigner: WALLET, roleSnapshot: "HEAD_MAINTENANCE_ROLE" }));
    const res = await confirmSignature(
      jsonRequest(`http://localhost/api/mantenimiento/signatures/${SIGNATURE_UUID}`, {
        signature: "0x" + "33".repeat(65),
      }, "PATCH"),
      { params: Promise.resolve({ id: SIGNATURE_UUID }) },
    );
    expect(res.status).toBe(200);
    expect(mockOps.markSigned).toHaveBeenCalledWith(
      SIGNATURE_UUID,
      expect.objectContaining({ recoveredSigner: WALLET, roleSnapshot: "HEAD_MAINTENANCE_ROLE" }),
    );
  });

  it("bloquea la habitación cuando la firma autoriza EXACTAMENTE ese payload", async () => {
    const payload = { roomId: ROOM_UUID, incidentId: null, reason: "Fuga", until: null };
    mockOps.findById.mockResolvedValue(
      signatureRow({
        status: "SIGNED",
        roleSnapshot: "HEAD_MAINTENANCE_ROLE",
        contentHash: payloadHashOf("ROOM_BLOCK", payload),
      }),
    );
    mockMaintenance.blockRoomWithSignature.mockResolvedValue({
      roomId: ROOM_UUID,
      roomNumber: 201,
      previousPublicationStatus: "PUBLISHED",
      publicationStatus: "MAINTENANCE",
      blockedUntil: null,
      reason: "Fuga",
      incidentId: null,
      signatureId: SIGNATURE_UUID,
    });
    const res = await blockRoom(
      jsonRequest(`http://localhost/api/mantenimiento/rooms/${ROOM_UUID}/block`, {
        signatureId: SIGNATURE_UUID,
        reason: "Fuga",
      }),
      { params: Promise.resolve({ id: ROOM_UUID }) },
    );
    expect(res.status).toBe(200);
    expect(mockMaintenance.blockRoomWithSignature).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM_UUID, signatureId: SIGNATURE_UUID, actor: "admin@hotel.es" }),
    );
  });

  it("rechaza una firma cuyo contentHash no corresponde al payload aplicado", async () => {
    mockOps.findById.mockResolvedValue(
      signatureRow({
        status: "SIGNED",
        roleSnapshot: "HEAD_MAINTENANCE_ROLE",
        contentHash: payloadHashOf("ROOM_BLOCK", { roomId: ROOM_UUID, incidentId: null, reason: "OTRO", until: null }),
      }),
    );
    const res = await blockRoom(
      jsonRequest(`http://localhost/api/mantenimiento/rooms/${ROOM_UUID}/block`, {
        signatureId: SIGNATURE_UUID,
        reason: "Fuga",
      }),
      { params: Promise.resolve({ id: ROOM_UUID }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("SIGNATURE_PAYLOAD_MISMATCH");
    expect(mockMaintenance.blockRoomWithSignature).not.toHaveBeenCalled();
  });

  it("desbloquea solo con firma SIGNED de ROOM_UNBLOCK", async () => {
    const payload = { roomId: ROOM_UUID, incidentId: null, reason: "Resuelta" };
    mockOps.findById.mockResolvedValue(
      signatureRow({
        entityType: "ROOM_UNBLOCK",
        status: "SIGNED",
        roleSnapshot: "HEAD_MAINTENANCE_ROLE",
        contentHash: payloadHashOf("ROOM_UNBLOCK", payload),
      }),
    );
    mockMaintenance.unblockRoomWithSignature.mockResolvedValue({
      roomId: ROOM_UUID,
      roomNumber: 201,
      previousPublicationStatus: "MAINTENANCE",
      publicationStatus: "PUBLISHED",
      blockedUntil: null,
      reason: "Resuelta",
      incidentId: null,
      signatureId: SIGNATURE_UUID,
    });
    const res = await unblockRoom(
      jsonRequest(`http://localhost/api/mantenimiento/rooms/${ROOM_UUID}/unblock`, {
        signatureId: SIGNATURE_UUID,
        reason: "Resuelta",
      }),
      { params: Promise.resolve({ id: ROOM_UUID }) },
    );
    expect(res.status).toBe(200);
    expect(mockMaintenance.unblockRoomWithSignature).toHaveBeenCalled();
  });
});
