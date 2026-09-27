import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { guardMock, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockAuth } = vi.hoisted(() => ({
  mockRepo: {
    findById: vi.fn(),
    listImages: vi.fn(),
    recordPublication: vi.fn(),
    setPublicationStatus: vi.fn(),
  },
  mockAuth: {
    findUser: vi.fn(),
    verifyUserTotp: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    RoomsRepository: vi.fn(() => mockRepo),
    AuthService: vi.fn(() => mockAuth),
  };
});

import { GET, POST } from "./[id]/publish/route";
import { roomContentHash } from "@/lib/rooms";

const room = {
  id: "room-1",
  roomNumber: 101,
  roomType: "DOBLE",
  capacity: 2,
  beds: 2,
  sizeM2: null,
  descriptionEs: "Doble con vistas",
  descriptionEn: null,
  descriptionRu: null,
  baseRateWei: null,
  publicationStatus: "DRAFT",
  operationalStatus: "CLEAN",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const image = {
  id: "img-1",
  roomId: "room-1",
  fileName: "101-Doble-2026-09-26-1.jpg",
  storagePath: "/docs/imagenes/101-Doble-2026-09-26-1.jpg",
  position: 1,
  isCover: true,
  altTextEs: null,
  altTextEn: null,
  altTextRu: null,
  mimeType: "image/jpeg",
  byteSize: 1000,
  uploadedBy: "admin@hotel.es",
  uploadedAt: new Date(),
};

const request = (body?: unknown): NextRequest =>
  new NextRequest("http://localhost:3000/api/admin/rooms/room-1/publish", {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const idParams = () => ({ params: Promise.resolve({ id: "room-1" }) });

describe("POST /api/admin/rooms/[id]/publish (F1 · D-2, D-18, D-21)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockAuth.findUser.mockResolvedValue({ active: true, username: "admin@hotel.es" });
    mockAuth.verifyUserTotp.mockReturnValue(true);
  });

  it("exige TOTP (403 sin código)", async () => {
    const res = await POST(request({}), idParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("MFA_REQUIRED");
  });

  it("rechaza un TOTP inválido", async () => {
    mockAuth.verifyUserTotp.mockReturnValue(false);
    const res = await POST(request({ confirmTotpCode: "000000" }), idParams());
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("INVALID_MFA");
  });

  it("exige descripción en español (D-21)", async () => {
    mockRepo.findById.mockResolvedValueOnce({ ...room, descriptionEs: null });
    mockRepo.listImages.mockResolvedValueOnce([image]);
    const res = await POST(request({ confirmTotpCode: "123456" }), idParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("PUBLISH_REQUIRES_DESCRIPTION");
  });

  it("exige al menos una foto (D-20)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([]);
    const res = await POST(request({ confirmTotpCode: "123456" }), idParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("PUBLISH_REQUIRES_IMAGE");
  });

  it("publica pendiente de anclaje cuando no hay txHash (202)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    mockRepo.recordPublication.mockResolvedValueOnce({
      id: "pub-1",
      roomId: "room-1",
      contentHash: "0xhash",
      txHash: null,
      onChainAnchored: false,
      signature: null,
      signerAddress: null,
      publishedBy: "admin@hotel.es",
      publishedAt: new Date(),
      unpublishedAt: null,
    });
    mockRepo.setPublicationStatus.mockResolvedValueOnce({ ...room, publicationStatus: "PUBLISHED" });

    const res = await POST(request({ confirmTotpCode: "123456" }), idParams());
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.onChainAnchored).toBe(false);
    expect(data.contentHash).toMatch(/^0x[0-9a-f]+$/);
    expect(mockRepo.setPublicationStatus).toHaveBeenCalledWith("room-1", "PUBLISHED", "admin@hotel.es", expect.any(String));
  });

  it("publica anclada cuando llega un txHash real (200)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    mockRepo.recordPublication.mockResolvedValueOnce({
      id: "pub-2",
      roomId: "room-1",
      contentHash: "0xhash",
      txHash: "0xdead",
      onChainAnchored: true,
      signature: null,
      signerAddress: null,
      publishedBy: "admin@hotel.es",
      publishedAt: new Date(),
      unpublishedAt: null,
    });
    mockRepo.setPublicationStatus.mockResolvedValueOnce({ ...room, publicationStatus: "PUBLISHED" });

    const res = await POST(request({ confirmTotpCode: "123456", txHash: "0x" + "a".repeat(64) }), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.onChainAnchored).toBe(true);
  });

  it("devuelve 404 si la habitación no existe", async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    const res = await POST(request({ confirmTotpCode: "123456" }), idParams());
    expect(res.status).toBe(404);
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await POST(request({ confirmTotpCode: "123456" }), idParams());
    expect(res.status).toBe(401);
  });

  it("GET prepara la publicación devolviendo la huella a firmar (D-2/D-18)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    const res = await GET(request(), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(data.canPublish).toBe(true);
  });

  it("acepta una firma válida de la wallet sobre la huella (D-1/D-2)", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const contentHash = roomContentHash({
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      capacity: room.capacity,
      beds: room.beds,
      sizeM2: room.sizeM2,
      descriptionEs: room.descriptionEs,
      descriptionEn: room.descriptionEn,
      descriptionRu: room.descriptionRu,
      baseRateWei: room.baseRateWei,
      imageFileNames: [image.fileName],
    });
    const signature = await account.signMessage({ message: contentHash });

    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    mockRepo.recordPublication.mockResolvedValueOnce({
      id: "pub-3",
      roomId: "room-1",
      contentHash,
      txHash: null,
      onChainAnchored: false,
      signature,
      signerAddress: account.address,
      publishedBy: "admin@hotel.es",
      publishedAt: new Date(),
      unpublishedAt: null,
    });
    mockRepo.setPublicationStatus.mockResolvedValueOnce({ ...room, publicationStatus: "PUBLISHED" });

    const res = await POST(
      request({ confirmTotpCode: "123456", signature, signerAddress: account.address }),
      idParams(),
    );
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.signed).toBe(true);
    expect(mockRepo.recordPublication).toHaveBeenCalledWith(
      expect.objectContaining({ signature, signerAddress: account.address }),
    );
  });

  it("rechaza una firma que no corresponde a la huella (422)", async () => {
    const account = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const signature = await account.signMessage({ message: "0xotrahuella" });

    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);

    const res = await POST(
      request({ confirmTotpCode: "123456", signature, signerAddress: account.address }),
      idParams(),
    );
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("INVALID_SIGNATURE");
    expect(mockRepo.recordPublication).not.toHaveBeenCalled();
  });

  it("exige signature y signerAddress juntas (400)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    const res = await POST(request({ confirmTotpCode: "123456", signerAddress: "0x" + "a".repeat(40) }), idParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_SIGNATURE");
  });
});
