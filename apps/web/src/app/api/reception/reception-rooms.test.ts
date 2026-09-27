import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo } = vi.hoisted(() => ({ mockRepo: { listRooms: vi.fn() } }));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return { ...actual, RoomsRepository: vi.fn(() => mockRepo) };
});

import { GET } from "./rooms/route";

describe("GET /api/reception/rooms (F2 · D-34)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
  });

  it("exige RECEPTION_ROLE", async () => {
    await GET(new NextRequest("http://localhost/api/reception/rooms"));
    expect(lastRequiredRole()).toBe("RECEPTION_ROLE");
  });

  it("solo devuelve habitaciones publicadas y sin datos sensibles", async () => {
    mockRepo.listRooms.mockResolvedValueOnce([
      { id: "r1", roomNumber: 101, roomType: "DOBLE", publicationStatus: "PUBLISHED", descriptionEs: "secreta" },
      { id: "r2", roomNumber: 102, roomType: "SIMPLE", publicationStatus: "DRAFT", descriptionEs: "borrador" },
      { id: "r3", roomNumber: 103, roomType: "SUITE", publicationStatus: "PAUSED" },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/reception/rooms"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rooms).toEqual([{ id: "r1", roomNumber: 101, roomType: "DOBLE" }]);
    expect(JSON.stringify(data)).not.toContain("secreta");
  });
});
