import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    listImages: vi.fn(),
    addImage: vi.fn(),
    deleteImage: vi.fn(),
    setCoverImage: vi.fn(),
    listOffers: vi.fn(),
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
    setOfferActive: vi.fn(),
    deleteOffer: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, ContentRepository: vi.fn(() => mockRepo) };
});

import { GET as imagesGet, POST as imagesPost } from "./images/route";
import { DELETE as imageDelete, PATCH as imagePatch } from "./images/[id]/route";
import { GET as offersGet, POST as offersPost } from "./offers/route";
import { PATCH as offerPatch, DELETE as offerDelete } from "./offers/[id]/route";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("API de contenido de la home (F6 · D-73/D-74)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("la galería y los planes son solo del owner", async () => {
    mockRepo.listImages.mockResolvedValue([]);
    await imagesGet(new NextRequest("http://localhost/api/admin/content/images?section=HERO"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");

    mockRepo.listOffers.mockResolvedValue([]);
    await offersGet(new NextRequest("http://localhost/api/admin/content/offers"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
    expect(mockRepo.listOffers).toHaveBeenCalledWith({ activeOnly: false });
  });

  it("la subida exige fichero y sección válida", async () => {
    const form = new FormData();
    const request = new NextRequest("http://localhost/api/admin/content/images", { method: "POST", body: form });
    const res = await imagesPost(request);
    expect(res.status).toBe(400);
  });

  it("borra una imagen y avisa si no existe", async () => {
    mockRepo.deleteImage.mockResolvedValueOnce(true);
    const ok = await imageDelete(new NextRequest("http://localhost/api/admin/content/images/img-1", { method: "DELETE" }), { params: Promise.resolve({ id: "img-1" }) });
    expect(ok.status).toBe(200);

    mockRepo.deleteImage.mockResolvedValueOnce(false);
    const missing = await imageDelete(new NextRequest("http://localhost/api/admin/content/images/img-1", { method: "DELETE" }), { params: Promise.resolve({ id: "img-1" }) });
    expect(missing.status).toBe(404);
  });

  it("marca la portada de una sección (D-73)", async () => {
    mockRepo.setCoverImage.mockResolvedValueOnce({ id: "img-1", isCover: true });
    const res = await imagePatch(
      jsonRequest("http://localhost/api/admin/content/images/img-1", { section: "HERO" }, "PATCH"),
      { params: Promise.resolve({ id: "img-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockRepo.setCoverImage).toHaveBeenCalledWith("HERO", "img-1");
  });

  it("crea un plan informativo validando su entrada (D-74)", async () => {
    mockRepo.createOffer.mockResolvedValueOnce({ id: "off-1", code: "VERANO" });
    const ok = await offersPost(
      jsonRequest("http://localhost/api/admin/content/offers", { code: "verano", titleEs: "Escapada", validFrom: "2026-06-01", validTo: "2026-09-30" }),
    );
    expect(ok.status).toBe(201);
    expect(mockRepo.createOffer).toHaveBeenCalledWith(expect.objectContaining({ code: "VERANO", titleEs: "Escapada" }));

    const bad = await offersPost(jsonRequest("http://localhost/api/admin/content/offers", { code: "X" }));
    expect(bad.status).toBe(400);

    const badRange = await offersPost(
      jsonRequest("http://localhost/api/admin/content/offers", { code: "X", titleEs: "T", validFrom: "2026-10-01", validTo: "2026-09-01" }),
    );
    expect(badRange.status).toBe(400);
  });

  it("edita y borra un plan", async () => {
    mockRepo.updateOffer.mockResolvedValueOnce({ id: "off-1", active: false });
    const ok = await offerPatch(
      jsonRequest("http://localhost/api/admin/content/offers/off-1", { active: false }, "PATCH"),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(ok.status).toBe(200);

    mockRepo.deleteOffer.mockResolvedValueOnce(true);
    const removed = await offerDelete(
      new NextRequest("http://localhost/api/admin/content/offers/off-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "off-1" }) },
    );
    expect(removed.status).toBe(200);
  });
});
