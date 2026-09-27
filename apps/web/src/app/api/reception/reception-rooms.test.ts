import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, lastRequiredRole, resetGuardState } from "../../../../test/guard-mock";
import type * as SharedModule from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRepo, mockMaintenance } = vi.hoisted(() => ({
  mockRepo: { listRooms: vi.fn() },
  mockMaintenance: { listBlockedRoomIds: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    RoomsRepository: vi.fn(() => mockRepo),
    MaintenanceRepository: vi.fn(() => mockMaintenance),
  };
});

import { GET } from "./rooms/route";

describe("GET /api/reception/rooms (F2 · D-34, F4 · D-53)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    mockRepo.listRooms.mockResolvedValue([]);
    mockMaintenance.listBlockedRoomIds.mockResolvedValue([]);
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

  it("excluye las habitaciones bloqueadas por una avería abierta (D-53)", async () => {
    mockRepo.listRooms.mockResolvedValueOnce([
      { id: "r1", roomNumber: 101, roomType: "DOBLE", publicationStatus: "PUBLISHED" },
      { id: "r2", roomNumber: 102, roomType: "SIMPLE", publicationStatus: "PUBLISHED" },
    ]);
    mockMaintenance.listBlockedRoomIds.mockResolvedValueOnce(["r1"]);
    const res = await GET(new NextRequest("http://localhost/api/reception/rooms"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rooms).toEqual([{ id: "r2", roomNumber: 102, roomType: "SIMPLE" }]);
  });
});
