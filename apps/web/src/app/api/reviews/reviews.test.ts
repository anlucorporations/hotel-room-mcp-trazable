import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import { ReviewError } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockNfts, mockRooms, mockReviews, mockOwnership } = vi.hoisted(() => ({
  mockNfts: { getNFTById: vi.fn() },
  mockRooms: { findByNumber: vi.fn() },
  mockReviews: { findByToken: vi.fn(), create: vi.fn(), listByStatus: vi.fn(), moderate: vi.fn() },
  mockOwnership: { requireReviewOwnership: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    NFTsRepository: vi.fn(() => mockNfts),
    RoomsRepository: vi.fn(() => mockRooms),
    ReviewsRepository: vi.fn(() => mockReviews),
  };
});

vi.mock("@/lib/ticket-ownership", () => mockOwnership);

import { POST as reviewPost } from "./route";
import { GET as adminReviewsGet } from "../admin/reviews/route";
import { PATCH as reviewPatch } from "../admin/reviews/[id]/route";

const jsonRequest = (url: string, body: unknown, method = "POST"): NextRequest =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

const consumedNight = { tokenId: "10120260926", roomNumber: 101, roomType: "DOBLE", status: "CHECKED_OUT", currentOwner: "0xabc" };

describe("API de Reseñas (F6 · D-58/D-59)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockOwnership.requireReviewOwnership.mockResolvedValue({ ok: true, wallet: "0xabc", onChainOwner: "0xabc" });
    mockReviews.findByToken.mockResolvedValue(null);
    mockRooms.findByNumber.mockResolvedValue({ id: "room-1" });
  });

  it("valida la nota antes de nada (400)", async () => {
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "t1", rating: 9 }));
    expect(res.status).toBe(400);
    expect(mockOwnership.requireReviewOwnership).not.toHaveBeenCalled();
  });

  it("404 si la noche no existe", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce(null);
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "t1", rating: 5 }));
    expect(res.status).toBe(404);
  });

  it("409 si la noche no está consumida (D-59)", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce({ ...consumedNight, status: "SOLD" });
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "t1", rating: 5 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("STAY_NOT_CONSUMED");
  });

  it("409 si ya hay reseña (una por noche)", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce(consumedNight);
    mockReviews.findByToken.mockResolvedValueOnce({ id: "rev-1" });
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "t1", rating: 5 }));
    expect(res.status).toBe(409);
    expect(mockOwnership.requireReviewOwnership).not.toHaveBeenCalled();
  });

  it("exige la firma del titular y la nota va dentro (D-59)", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce(consumedNight);
    mockOwnership.requireReviewOwnership.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "t1", rating: 4 }));
    expect(res.status).toBe(401);
    expect(mockOwnership.requireReviewOwnership).toHaveBeenCalledWith(expect.anything(), "t1", 4, "0xabc");
  });

  it("crea la reseña PENDING con su tipo y habitación (201)", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce(consumedNight);
    mockReviews.create.mockResolvedValueOnce({ id: "rev-1", status: "PENDING" });
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "10120260926", rating: 5, comment: "Genial" }));
    expect(res.status).toBe(201);
    expect(mockReviews.create).toHaveBeenCalledWith({
      tokenId: "10120260926",
      roomType: "DOBLE",
      roomId: "room-1",
      rating: 5,
      comment: "Genial",
    });
  });

  it("traduce el duplicado del repositorio a 409", async () => {
    mockNfts.getNFTById.mockResolvedValueOnce(consumedNight);
    mockReviews.create.mockRejectedValueOnce(new ReviewError("ALREADY_REVIEWED", "dup"));
    const res = await reviewPost(jsonRequest("http://localhost/api/reviews", { tokenId: "10120260926", rating: 5 }));
    expect(res.status).toBe(409);
  });

  it("la moderación es solo del owner", async () => {
    mockReviews.listByStatus.mockResolvedValueOnce([]);
    await adminReviewsGet(new NextRequest("http://localhost/api/admin/reviews?status=PENDING"));
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
    expect(mockReviews.listByStatus).toHaveBeenCalledWith("PENDING");
  });

  it("aprueba una reseña y deja el motivo (D-58)", async () => {
    mockReviews.moderate.mockResolvedValueOnce({ id: "rev-1", status: "APPROVED" });
    const res = await reviewPatch(
      jsonRequest("http://localhost/api/admin/reviews/rev-1", { action: "approve", reason: "Correcta" }, "PATCH"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockReviews.moderate).toHaveBeenCalledWith("rev-1", "APPROVED", "admin@hotel.es", "Correcta");
  });

  it("409 si la reseña ya estaba moderada, y 400 si la acción no es válida", async () => {
    mockReviews.moderate.mockResolvedValueOnce(null);
    const conflict = await reviewPatch(
      jsonRequest("http://localhost/api/admin/reviews/rev-1", { action: "reject" }, "PATCH"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(conflict.status).toBe(409);

    const bad = await reviewPatch(
      jsonRequest("http://localhost/api/admin/reviews/rev-1", { action: "quizá" }, "PATCH"),
      { params: Promise.resolve({ id: "rev-1" }) },
    );
    expect(bad.status).toBe(400);
  });
});
