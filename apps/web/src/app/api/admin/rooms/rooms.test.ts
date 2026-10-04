import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import { RoomRepositoryError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    findById: vi.fn(),
    updateRoom: vi.fn(),
    setPublicationStatus: vi.fn(),
    setOperationalStatus: vi.fn(),
    archiveRoom: vi.fn(),
    listImages: vi.fn(),
    listPublications: vi.fn(),
    // Ficha ampliada (2026-10-02).
    listAmenityCodes: vi.fn(),
    listRoomSpaces: vi.fn(),
    listReservedNights: vi.fn(),
    listRoomTypes: vi.fn(),
    listAmenityCatalog: vi.fn(),
    listSpaceTypes: vi.fn(),
    setRoomAmenities: vi.fn(),
    setRoomSpaces: vi.fn(),
    // Tablero 2026-10-04 (distintivo «Reservada»).
    countReservedNightsByRooms: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, RoomsRepository: vi.fn(() => mockRepo) };
});

import { GET as listGET, POST as createPOST } from "./route";
import { GET as getGET, PATCH, DELETE } from "./[id]/route";

const room = {
  id: "room-1",
  roomNumber: 101,
  floor: 1,
  roomType: "DOBLE",
  capacity: 2,
  beds: 2,
  sizeM2: 24.5,
  descriptionEs: "Doble",
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

const request = (method: string, url = "http://localhost:3000/api/admin/rooms", body?: unknown): NextRequest =>
  new NextRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

const idParams = (id = "room-1") => ({ params: Promise.resolve({ id }) });

describe("API /api/admin/rooms (F1 · D-1, D-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("GET exige el rol de administrador", async () => {
    await listGET(request("GET"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("GET devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await listGET(request("GET"));
    expect(res.status).toBe(401);
  });

  it("GET excluye las archivadas por defecto", async () => {
    mockRepo.listRooms.mockResolvedValueOnce([room]);
    mockRepo.countReservedNightsByRooms.mockResolvedValueOnce(new Map());
    const res = await listGET(request("GET"));
    expect(res.status).toBe(200);
    expect(mockRepo.listRooms).toHaveBeenCalledWith({ includeArchived: false });
  });

  it("GET incluye las archivadas con ?includeArchived=true", async () => {
    mockRepo.listRooms.mockResolvedValueOnce([room]);
    mockRepo.countReservedNightsByRooms.mockResolvedValueOnce(new Map());
    await listGET(request("GET", "http://localhost:3000/api/admin/rooms?includeArchived=true"));
    expect(mockRepo.listRooms).toHaveBeenCalledWith({ includeArchived: true });
  });

  it("GET añade reservedNights por habitación (0 si no hay noches ocupadas, 2026-10-04)", async () => {
    mockRepo.listRooms.mockResolvedValueOnce([room]);
    mockRepo.countReservedNightsByRooms.mockResolvedValueOnce(new Map([["room-1", 3]]));
    const res = await listGET(request("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rooms[0].reservedNights).toBe(3);
    expect(data.reservedWindow).toMatchObject({ from: expect.any(String), to: expect.any(String) });
  });

  it("POST rechaza un tipo de habitación no admitido (D-22)", async () => {
    const res = await createPOST(request("POST", undefined, { roomNumber: 131, roomType: "TRIPLE", capacity: 3, beds: 3 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_ROOM_TYPE");
    expect(mockRepo.createRoom).not.toHaveBeenCalled();
  });

  it("POST rechaza si falta un campo obligatorio (D-21)", async () => {
    const res = await createPOST(request("POST", undefined, { roomNumber: 131, roomType: "SIMPLE" }));
    expect(res.status).toBe(400);
    expect(mockRepo.createRoom).not.toHaveBeenCalled();
  });

  it("POST crea la habitación y admite números fuera de rango (D-7)", async () => {
    mockRepo.createRoom.mockResolvedValueOnce({ ...room, roomNumber: 131 });
    const res = await createPOST(request("POST", undefined, { roomNumber: 131, roomType: "SIMPLE", capacity: 1, beds: 1 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.room.roomNumber).toBe(131);
  });

  it("POST devuelve 409 si el número ya existe (D-7)", async () => {
    mockRepo.createRoom.mockRejectedValueOnce(new RoomRepositoryError("ROOM_NUMBER_TAKEN", "dup"));
    const res = await createPOST(request("POST", undefined, { roomNumber: 101, roomType: "DOBLE", capacity: 2, beds: 2 }));
    expect(res.status).toBe(409);
  });
});

describe("API /api/admin/rooms/[id] (F1 · D-8, D-19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("GET devuelve 404 si no existe", async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    const res = await getGET(request("GET"), idParams());
    expect(res.status).toBe(404);
  });

  it("GET devuelve la ficha con galería, publicaciones, servicios, espacios y ocupación", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([]);
    mockRepo.listPublications.mockResolvedValueOnce([]);
    mockRepo.listAmenityCodes.mockResolvedValueOnce(["WIFI"]);
    mockRepo.listRoomSpaces.mockResolvedValueOnce([{ spaceCode: "BANO", sizeM2: 6, sortOrder: 3 }]);
    mockRepo.listReservedNights.mockResolvedValueOnce(["2026-10-12"]);
    const res = await getGET(request("GET"), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.room.id).toBe("room-1");
    expect(data.images).toEqual([]);
    expect(data.amenities).toEqual(["WIFI"]);
    expect(data.spaces).toHaveLength(1);
    expect(data.reservedNights).toEqual(["2026-10-12"]);
    // La ventana del calendario se resuelve por defecto (semestre alrededor de hoy).
    expect(typeof data.window.from).toBe("string");
  });

  it("GET admite la ventana del calendario por query", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([]);
    mockRepo.listPublications.mockResolvedValueOnce([]);
    mockRepo.listAmenityCodes.mockResolvedValueOnce([]);
    mockRepo.listRoomSpaces.mockResolvedValueOnce([]);
    mockRepo.listReservedNights.mockResolvedValueOnce([]);
    const res = await getGET(
      request("GET", "http://localhost:3000/api/admin/rooms/room-1?from=2026-11-01&to=2026-11-30"),
      idParams(),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.window).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(mockRepo.listReservedNights).toHaveBeenCalledWith("room-1", "2026-11-01", "2026-11-30");
  });

  it("PATCH actualiza campos parciales", async () => {
    mockRepo.updateRoom.mockResolvedValueOnce({ ...room, capacity: 3 });
    const res = await PATCH(request("PATCH", undefined, { capacity: 3 }), idParams());
    expect(res.status).toBe(200);
    expect(mockRepo.updateRoom).toHaveBeenCalledWith("room-1", { capacity: 3 });
  });

  it("PATCH rechaza publicar por esta vía desde DRAFT (exige TOTP, D-2/D-18)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    const res = await PATCH(request("PATCH", undefined, { publicationStatus: "PUBLISHED" }), idParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("USE_PUBLISH_ENDPOINT");
    expect(mockRepo.setPublicationStatus).not.toHaveBeenCalled();
  });

  it("PATCH sí reanuda desde PAUSED a PUBLISHED sin TOTP (reanudación, 2026-10-04)", async () => {
    const paused = { ...room, publicationStatus: "PAUSED" as const };
    mockRepo.findById.mockResolvedValueOnce(paused);
    mockRepo.setPublicationStatus.mockResolvedValueOnce({ ...paused, publicationStatus: "PUBLISHED" });
    const res = await PATCH(request("PATCH", undefined, { publicationStatus: "PUBLISHED" }), idParams());
    expect(res.status).toBe(200);
    expect(mockRepo.setPublicationStatus).toHaveBeenCalledWith(
      "room-1",
      "PUBLISHED",
      "admin@hotel.es",
      expect.stringMatching(/Reanudada/),
    );
  });

  it("PATCH sí permite pausar (D-19)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.setPublicationStatus.mockResolvedValueOnce({ ...room, publicationStatus: "PAUSED" });
    const res = await PATCH(request("PATCH", undefined, { publicationStatus: "PAUSED" }), idParams());
    expect(res.status).toBe(200);
    expect(mockRepo.setPublicationStatus).toHaveBeenCalledWith("room-1", "PAUSED", "admin@hotel.es", undefined);
  });

  it("PATCH cambia el estado operativo (D-19)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.setOperationalStatus.mockResolvedValueOnce({ ...room, operationalStatus: "DIRTY" });
    const res = await PATCH(request("PATCH", undefined, { operationalStatus: "DIRTY" }), idParams());
    expect(res.status).toBe(200);
    expect(mockRepo.setOperationalStatus).toHaveBeenCalledWith("room-1", "DIRTY", "admin@hotel.es");
  });

  it("PATCH rechaza un estado operativo inventado", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    const res = await PATCH(request("PATCH", undefined, { operationalStatus: "MOJADA" }), idParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_STATUS");
  });

  it("DELETE archiva (nunca borra) y devuelve la habitación archivada (D-8)", async () => {
    mockRepo.archiveRoom.mockResolvedValueOnce({ ...room, publicationStatus: "OUT_OF_SERVICE", archivedAt: new Date() });
    const res = await DELETE(request("DELETE"), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.room.publicationStatus).toBe("OUT_OF_SERVICE");
    expect(mockRepo.archiveRoom).toHaveBeenCalledWith("room-1", "admin@hotel.es");
  });

  it("DELETE devuelve 404 si no existe", async () => {
    mockRepo.archiveRoom.mockResolvedValueOnce(null);
    const res = await DELETE(request("DELETE"), idParams());
    expect(res.status).toBe(404);
  });
});
