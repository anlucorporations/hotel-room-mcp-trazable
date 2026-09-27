import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, resetGuardState, setGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    findById: vi.fn(),
    listImages: vi.fn(),
    addImage: vi.fn(),
    findImageById: vi.fn(),
    setCoverImage: vi.fn(),
    deleteImage: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, RoomsRepository: vi.fn(() => mockRepo) };
});

import { mkdir, writeFile, unlink } from "node:fs/promises";
import { GET as listGET, POST as uploadPOST } from "./[id]/images/route";
import { PATCH as coverPATCH, DELETE as imageDELETE } from "./[id]/images/[imageId]/route";

const room = {
  id: "room-1",
  roomNumber: 101,
  roomType: "DOBLE",
  capacity: 2,
  beds: 2,
  sizeM2: null,
  descriptionEs: "Doble",
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
  storagePath: "docs/imagenes/101-Doble-2026-09-26-1.jpg",
  position: 1,
  isCover: true,
  altTextEs: null,
  altTextEn: null,
  altTextRu: null,
  mimeType: "image/jpeg",
  byteSize: 6,
  uploadedBy: "admin@hotel.es",
  uploadedAt: new Date(),
};

const idParams = (id = "room-1") => ({ params: Promise.resolve({ id }) });
const imageParams = (imageId = "img-1") => ({ params: Promise.resolve({ id: "room-1", imageId }) });

function jpegFormData(): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.jpg", { type: "image/jpeg" }));
  form.append("altTextEs", "Habitación doble");
  return form;
}

describe("API galería de habitación (F1 · D-5, D-20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    process.env.ROOM_IMAGES_DIR = "/tmp/room-images-test";
  });

  it("GET exige administrador y devuelve las imágenes con su URL", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    const res = await listGET(new NextRequest("http://localhost/api/admin/rooms/room-1/images"), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.images[0].url).toBe("/api/rooms/images/101-Doble-2026-09-26-1.jpg");
  });

  it("GET devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await listGET(new NextRequest("http://localhost/api/admin/rooms/room-1/images"), idParams());
    expect(res.status).toBe(401);
  });

  it("POST sube un JPG válido: guarda el fichero y registra la fila", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([]);
    mockRepo.addImage.mockResolvedValueOnce(image);

    const req = new NextRequest("http://localhost/api/admin/rooms/room-1/images", {
      method: "POST",
      body: jpegFormData(),
    });
    const res = await uploadPOST(req, idParams());
    expect(res.status).toBe(201);
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    const arg = mockRepo.addImage.mock.calls[0]?.[0] as {
      fileName: string;
      isCover: boolean;
      altTextEs: string | null;
    };
    expect(arg.fileName).toMatch(/^101-Doble-\d{4}-\d{2}-\d{2}-1\.jpg$/);
    expect(arg.isCover).toBe(true);
    expect(arg.altTextEs).toBe("Habitación doble");
  });

  it("POST rechaza un fichero que no es JPG (D-20)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([]);
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", { type: "image/png" }));
    const req = new NextRequest("http://localhost/api/admin/rooms/room-1/images", { method: "POST", body: form });
    const res = await uploadPOST(req, idParams());
    expect(res.status).toBe(400);
    expect(mockRepo.addImage).not.toHaveBeenCalled();
  });

  it("POST rechaza la sexta foto (D-20)", async () => {
    mockRepo.findById.mockResolvedValueOnce(room);
    mockRepo.listImages.mockResolvedValueOnce([1, 2, 3, 4, 5].map((n) => ({ ...image, id: `img-${n}`, position: n })));
    const req = new NextRequest("http://localhost/api/admin/rooms/room-1/images", {
      method: "POST",
      body: jpegFormData(),
    });
    const res = await uploadPOST(req, idParams());
    expect(res.status).toBe(409);
    expect(mockRepo.addImage).not.toHaveBeenCalled();
  });

  it("PATCH marca la portada", async () => {
    mockRepo.setCoverImage.mockResolvedValueOnce(true);
    mockRepo.listImages.mockResolvedValueOnce([image]);
    const req = new NextRequest("http://localhost/api/admin/rooms/room-1/images/img-1", {
      method: "PATCH",
      body: JSON.stringify({ isCover: true }),
    });
    const res = await coverPATCH(req, imageParams());
    expect(res.status).toBe(200);
    expect(mockRepo.setCoverImage).toHaveBeenCalledWith("room-1", "img-1");
  });

  it("DELETE borra fila y fichero", async () => {
    mockRepo.findImageById.mockResolvedValueOnce(image);
    mockRepo.deleteImage.mockResolvedValueOnce(true);
    const res = await imageDELETE(new NextRequest("http://localhost/api/admin/rooms/room-1/images/img-1", { method: "DELETE" }), imageParams());
    expect(res.status).toBe(200);
    expect(mockRepo.deleteImage).toHaveBeenCalledWith("img-1");
    expect(unlink).toHaveBeenCalled();
  });

  it("DELETE devuelve 404 si la imagen es de otra habitación", async () => {
    mockRepo.findImageById.mockResolvedValueOnce({ ...image, roomId: "room-OTRA" });
    const res = await imageDELETE(new NextRequest("http://localhost/api/admin/rooms/room-1/images/img-1", { method: "DELETE" }), imageParams());
    expect(res.status).toBe(404);
  });
});
