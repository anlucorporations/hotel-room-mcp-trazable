import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeTokenId } from "@hotel/shared";
import type * as SharedModule from "@hotel/shared";
import { guardMock, lastRequiredRole, resetGuardState, setGuardState } from "../../../../../../../test/guard-mock";

vi.mock("@/lib/guard", () => guardMock);

const { mockRooms, mockNfts, mockSettings } = vi.hoisted(() => ({
  mockRooms: { findById: vi.fn() },
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

/** Habitación publicada y con tarifa base: puede acuñar (D-16). */
const room = {
  id: "room-1",
  roomNumber: 101,
  roomType: "DOBLE",
  baseRateWei: "50000000000000000",
  publicationStatus: "PUBLISHED",
};

const request = (): NextRequest =>
  new NextRequest("http://localhost:3000/api/admin/rooms/room-1/mint-window");

const idParams = () => ({ params: Promise.resolve({ id: "room-1" }) });

describe("GET /api/admin/rooms/[id]/mint-window (F8 · D-4/D-11/D-16/D-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGuardState();
    // Fechas fijas: la ventana se calcula desde el reloj UTC (D-4).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    mockSettings.getNumber.mockResolvedValue(3);
    mockNfts.listByRoomInDateRange.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exige DEFAULT_ADMIN_ROLE", async () => {
    mockRooms.findById.mockResolvedValueOnce(room);
    await GET(request(), idParams());
    expect(lastRequiredRole()).toBe("DEFAULT_ADMIN_ROLE");
  });

  it("devuelve 401 sin sesión", async () => {
    setGuardState("unauthorized");
    const res = await GET(request(), idParams());
    expect(res.status).toBe(401);
    expect(mockRooms.findById).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la habitación no existe", async () => {
    mockRooms.findById.mockResolvedValueOnce(null);
    const res = await GET(request(), idParams());
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("ROOM_NOT_FOUND");
  });

  it("calcula las noches ausentes y avisa del agotamiento (D-17)", async () => {
    mockRooms.findById.mockResolvedValueOnce(room);
    // La noche del 2026-06-02 ya existe y sigue libre: se omite (D-16) y cuenta como libre.
    mockNfts.listByRoomInDateRange.mockResolvedValueOnce([
      { tokenId: encodeTokenId(101, 20260602).toString(), status: "AVAILABLE" },
    ]);

    const res = await GET(request(), idParams());
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(mockSettings.getNumber).toHaveBeenCalledWith("mint_window_days", 90);
    expect(mockNfts.listByRoomInDateRange).toHaveBeenCalledWith(101, "2026-06-02", "2026-06-04");

    expect(data.windowDays).toBe(3);
    expect(data.canMint).toBe(true);
    expect(data.nights.map((night: { dateYYYYMMDD: number }) => night.dateYYYYMMDD)).toEqual([
      20260603, 20260604,
    ]);
    expect(data.nights[0].tokenId).toBe(encodeTokenId(101, 20260603).toString());
    expect(data.nights[0].priceWei).toBe(room.baseRateWei);
    expect(data.status).toEqual({ windowDays: 3, missing: 2, freeNights: 1, low: true });
  });

  it("no marca `low` cuando quedan noches libres suficientes (D-17)", async () => {
    mockRooms.findById.mockResolvedValueOnce(room);
    mockSettings.getNumber.mockResolvedValueOnce(2);
    const libres = Array.from({ length: 7 }, (_, index) => ({
      tokenId: encodeTokenId(101, 20260602 + index).toString(),
      status: "AVAILABLE",
    }));
    mockNfts.listByRoomInDateRange.mockResolvedValueOnce(libres);

    const res = await GET(request(), idParams());
    const data = await res.json();
    expect(data.status).toEqual({ windowDays: 2, missing: 0, freeNights: 7, low: false });
  });
});
