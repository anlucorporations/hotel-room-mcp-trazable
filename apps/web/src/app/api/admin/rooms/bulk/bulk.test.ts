import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, resetGuardState, setGuardState } from "../../../../../../test/guard-mock";
import type * as Shared from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRooms, mockAuth, mockReservations } = vi.hoisted(() => ({
  mockRooms: {
    findById: vi.fn(),
    listImages: vi.fn(),
    recordPublication: vi.fn(),
    setPublicationStatus: vi.fn(),
    listReleaseableReservationIds: vi.fn(),
  },
  mockAuth: {
    findUser: vi.fn(),
    verifyUserTotp: vi.fn(),
  },
  mockReservations: {
    cancelReservation: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof Shared>();
  return {
    ...actual,
    RoomsRepository: vi.fn(() => mockRooms),
    AuthService: vi.fn(() => mockAuth),
    ReservationsRepository: vi.fn(() => mockReservations),
  };
});

import { POST as bulkPublishPOST } from "./publish/route";
import { POST as bulkReleasePOST } from "./release/route";
import { POST as bulkTogglePOST } from "./toggle/route";

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
  viewKind: null,
  hasBalcony: false,
  isAccessible: false,
  decorStyle: null,
  decorPalette: null,
  decorMaterials: null,
  decorNotesEs: null,
  decorNotesEn: null,
  decorNotesRu: null,
  publicationStatus: "DRAFT",
  operationalStatus: "CLEAN",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const image = {
  id: "img-1",
  roomId: "room-1",
  fileName: "101-Doble.jpg",
  storagePath: "/docs/imagenes/101-Doble.jpg",
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

const publication = {
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
};

const request = (url: string, body: unknown): NextRequest =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body) });

const BASE = "http://localhost:3000/api/admin/rooms";

beforeEach(() => {
  vi.clearAllMocks();
  resetGuardState();
  mockAuth.findUser.mockResolvedValue({ active: true, username: "admin@hotel.es" });
  mockAuth.verifyUserTotp.mockReturnValue(true);
  mockRooms.listImages.mockResolvedValue([image]);
  mockRooms.recordPublication.mockResolvedValue(publication);
  mockRooms.setPublicationStatus.mockImplementation(async (_id, status) => ({ ...room, publicationStatus: status }));
  mockReservations.cancelReservation.mockResolvedValue({ id: "res-1", status: "CANCELLED" });
});

describe("POST /api/admin/rooms/bulk/publish (2026-10-04, tablero Admin)", () => {
  it("rechaza un lote vacío (400)", async () => {
    const res = await bulkPublishPOST(request(`${BASE}/bulk/publish`, { roomIds: [], confirmTotpCode: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_BODY");
  });

  it("exige el código TOTP (403)", async () => {
    const res = await bulkPublishPOST(request(`${BASE}/bulk/publish`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("MFA_REQUIRED");
  });

  it("rechaza un TOTP inválido (403)", async () => {
    mockAuth.verifyUserTotp.mockReturnValue(false);
    const res = await bulkPublishPOST(request(`${BASE}/bulk/publish`, { roomIds: ["room-1"], confirmTotpCode: "000000" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_MFA");
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await bulkPublishPOST(request(`${BASE}/bulk/publish`, { roomIds: ["room-1"], confirmTotpCode: "123456" }));
    expect(res.status).toBe(401);
  });

  it("publica el lote con un TOTP y detalla los fallos por habitación", async () => {
    mockRooms.findById.mockImplementation(async (id: string) =>
      id === "room-1" ? room : { ...room, id: "room-2", roomNumber: 102, publicationStatus: "PUBLISHED" },
    );
    const res = await bulkPublishPOST(
      request(`${BASE}/bulk/publish`, { roomIds: ["room-1", "room-2"], confirmTotpCode: "123456" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.published).toBe(1);
    expect(data.results).toHaveLength(2);
    expect(data.results[0]).toMatchObject({ roomId: "room-1", ok: true, onChainAnchored: false });
    expect(data.results[1]).toMatchObject({ roomId: "room-2", ok: false, error: "ALREADY_PUBLISHED" });
    expect(mockRooms.setPublicationStatus).toHaveBeenCalledTimes(1);
    expect(mockAuth.verifyUserTotp).toHaveBeenCalledTimes(1);
  });

  it("admite txHashes por habitación (anclaje best-effort, D-18)", async () => {
    mockRooms.findById.mockResolvedValue(room);
    mockRooms.recordPublication.mockResolvedValue({ ...publication, txHash: "0x" + "a".repeat(64), onChainAnchored: true });
    const res = await bulkPublishPOST(
      request(`${BASE}/bulk/publish`, {
        roomIds: ["room-1"],
        confirmTotpCode: "123456",
        txHashes: { "room-1": "0x" + "a".repeat(64) },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRooms.recordPublication).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room-1", txHash: "0x" + "a".repeat(64) }),
    );
    expect(((await res.json()).results[0]).onChainAnchored).toBe(true);
  });

  it("devuelve 400 si ninguna habitación se publica", async () => {
    mockRooms.findById.mockResolvedValue(null);
    const res = await bulkPublishPOST(
      request(`${BASE}/bulk/publish`, { roomIds: ["room-x"], confirmTotpCode: "123456" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.published).toBe(0);
    expect(data.results[0]).toMatchObject({ roomId: "room-x", ok: false, error: "ROOM_NOT_FOUND" });
  });
});

describe("POST /api/admin/rooms/bulk/release (2026-10-04, acción «Liberar»)", () => {
  it("rechaza un lote vacío (400)", async () => {
    const res = await bulkReleasePOST(request(`${BASE}/bulk/release`, { roomIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_BODY");
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await bulkReleasePOST(request(`${BASE}/bulk/release`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(401);
  });

  it("cancela las reservas activas de la ventana y lo detalla por habitación", async () => {
    mockRooms.findById.mockResolvedValue(room);
    mockRooms.listReleaseableReservationIds.mockResolvedValue(["res-1", "res-2"]);
    const res = await bulkReleasePOST(request(`${BASE}/bulk/release`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.released).toBe(2);
    expect(data.results[0]).toMatchObject({ roomId: "room-1", roomNumber: 101, released: 2 });
    expect(mockReservations.cancelReservation).toHaveBeenCalledTimes(2);
    expect(mockReservations.cancelReservation).toHaveBeenCalledWith(
      "res-1",
      "admin@hotel.es",
      expect.stringMatching(/Liberación masiva/),
    );
  });

  it("libera solo el día indicado cuando llega `date` (tablero de disponibilidad)", async () => {
    mockRooms.findById.mockResolvedValue(room);
    mockRooms.listReleaseableReservationIds.mockResolvedValue(["res-1"]);
    const res = await bulkReleasePOST(request(`${BASE}/bulk/release`, { roomIds: ["room-1"], date: "2026-11-20" }));
    expect(res.status).toBe(200);
    expect(mockRooms.listReleaseableReservationIds).toHaveBeenCalledWith("room-1", "2026-11-20", "2026-11-20");
  });

  it("devuelve released=0 si la habitación solo tiene noches vendidas (sin reservas)", async () => {
    mockRooms.findById.mockResolvedValue(room);
    mockRooms.listReleaseableReservationIds.mockResolvedValue([]);
    const res = await bulkReleasePOST(request(`${BASE}/bulk/release`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(200);
    expect((await res.json()).released).toBe(0);
    expect(mockReservations.cancelReservation).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/rooms/bulk/toggle (2026-10-04, acción «Activar/Desactivar»)", () => {
  it("conmuta PUBLISHED → PAUSED (desactivar)", async () => {
    mockRooms.findById.mockResolvedValue({ ...room, publicationStatus: "PUBLISHED" });
    const res = await bulkTogglePOST(request(`${BASE}/bulk/toggle`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(200);
    expect(mockRooms.setPublicationStatus).toHaveBeenCalledWith("room-1", "PAUSED", "admin@hotel.es", expect.stringMatching(/Desactivada masivamente/));
    expect(((await res.json()).results[0]).toStatus).toBe("PAUSED");
  });

  it("conmuta PAUSED → PUBLISHED (reanudar sin TOTP, 2026-10-04)", async () => {
    mockRooms.findById.mockResolvedValue({ ...room, publicationStatus: "PAUSED" });
    const res = await bulkTogglePOST(request(`${BASE}/bulk/toggle`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(200);
    expect(mockRooms.setPublicationStatus).toHaveBeenCalledWith("room-1", "PUBLISHED", "admin@hotel.es", expect.stringMatching(/Reanudada masivamente/));
    expect(((await res.json()).results[0]).toStatus).toBe("PUBLISHED");
  });

  it("no conmuta desde DRAFT (NOT_TOGGLEABLE) y devuelve 400 si ninguna se conmuta", async () => {
    mockRooms.findById.mockResolvedValue({ ...room, publicationStatus: "MAINTENANCE" });
    const res = await bulkTogglePOST(request(`${BASE}/bulk/toggle`, { roomIds: ["room-1"] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.toggled).toBe(0);
    expect(data.results[0]).toMatchObject({ roomId: "room-1", ok: false, error: "NOT_TOGGLEABLE" });
    expect(mockRooms.setPublicationStatus).not.toHaveBeenCalled();
  });

  it("rechaza un lote vacío (400)", async () => {
    const res = await bulkTogglePOST(request(`${BASE}/bulk/toggle`, { roomIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_BODY");
  });
});
