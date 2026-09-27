import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeTokenId } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";
import { guardMock, resetGuardState, setGuardState } from "../../../../../../test/guard-mock";

vi.mock("@/lib/guard", () => guardMock);

const { mockRooms, mockNfts, mockSettings } = vi.hoisted(() => ({
  mockRooms: { listRooms: vi.fn() },
  mockNfts: { listByRoomInDateRange: vi.fn() },
  mockSettings: { getNumber: vi.fn() },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    RoomsRepository: vi.fn(() => mockRooms),
    NFTsRepository: vi.fn(() => mockNfts),
    SettingsRepository: vi.fn(() => mockSettings),
  };
});

import { GET } from "./route";

const published = {
  id: "room-1",
  roomNumber: 101,
  roomType: "SIMPLE",
  baseRateWei: "50000000000000000",
  publicationStatus: "PUBLISHED",
};
const draft = { ...published, id: "room-2", roomNumber: 102, publicationStatus: "DRAFT" };

const request = (): NextRequest =>
  new NextRequest("http://localhost:3000/api/admin/rooms/window-overview");

describe("GET /api/admin/rooms/window-overview (F8 · barrido global)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    mockSettings.getNumber.mockResolvedValue(3);
    mockNfts.listByRoomInDateRange.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockRooms.listRooms).not.toHaveBeenCalled();
  });

  it("solo incluye habitaciones PUBLICADAS y calcula el barrido", async () => {
    mockRooms.listRooms.mockResolvedValueOnce([published, draft]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(mockSettings.getNumber).toHaveBeenCalledWith("mint_window_days", 90);
    expect(mockNfts.listByRoomInDateRange).toHaveBeenCalledWith(101, "2026-06-02", "2026-06-04");

    expect(data.windowDays).toBe(3);
    expect(data.rooms).toHaveLength(1);
    expect(data.rooms[0]).toMatchObject({ roomNumber: 101, missing: 3, freeNights: 0, low: true });
    expect(data.totals).toEqual({ rooms: 1, missing: 3, low: 1 });
  });

  it("descuenta las noches ya existentes y no marca low si hay libres suficientes", async () => {
    mockRooms.listRooms.mockResolvedValueOnce([published]);
    mockSettings.getNumber.mockResolvedValueOnce(2);
    mockNfts.listByRoomInDateRange.mockResolvedValueOnce(
      Array.from({ length: 7 }, (_, index) => ({
        tokenId: encodeTokenId(101, 20260602 + index).toString(),
        status: "AVAILABLE",
      })),
    );

    const res = await GET(request());
    const data = await res.json();
    expect(data.rooms[0]).toMatchObject({ missing: 0, freeNights: 7, low: false });
    expect(data.totals).toEqual({ rooms: 1, missing: 0, low: 0 });
  });
});
