import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { guardMock, resetGuardState, setGuardState } from "../../../../../../test/guard-mock";
import type * as Shared from "@hotel/shared";

vi.mock("@/lib/guard", () => guardMock);

const { mockRooms } = vi.hoisted(() => ({
  mockRooms: {
    listRooms: vi.fn(),
    listRoomDayStates: vi.fn(),
    listRoomIdsInMaintenance: vi.fn(),
  },
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof Shared>();
  return { ...actual, RoomsRepository: vi.fn(() => mockRooms) };
});

import { GET } from "./route";

const BASE = "http://localhost:3000/api/admin/rooms/calendar";
const request = (query: string): NextRequest => new NextRequest(`${BASE}${query}`, { method: "GET" });

const room = (id: string, roomNumber: number) => ({
  id,
  roomNumber,
  floor: 1,
  roomType: "DOBLE",
  capacity: 2,
  beds: 2,
  sizeM2: null,
  descriptionEs: null,
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
  publicationStatus: "PUBLISHED",
  operationalStatus: "CLEAN",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  resetGuardState();
  mockRooms.listRooms.mockResolvedValue([]);
  mockRooms.listRoomDayStates.mockResolvedValue([]);
  mockRooms.listRoomIdsInMaintenance.mockResolvedValue([]);
});

describe("GET /api/admin/rooms/calendar (2026-10-04)", () => {
  it("exige sesión de gestión (401)", async () => {
    setGuardState("unauthorized");
    const res = await GET(request("?from=2026-10-01&to=2026-10-31"));
    expect(res.status).toBe(401);
  });

  it("rechaza una fecha o un rango mal formados (400)", async () => {
    expect((await GET(request("?date=2026-13"))).status).toBe(400);
    expect((await GET(request("?from=2026-10-01"))).status).toBe(400);
    expect((await GET(request("?from=ayer&to=hoy"))).status).toBe(400);
  });

  it("rechaza un rango invertido (400)", async () => {
    const res = await GET(request("?from=2026-10-31&to=2026-10-01"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_RANGE");
  });

  it("rechaza un rango mayor que el tope (400)", async () => {
    const res = await GET(request("?from=2026-01-01&to=2028-01-01"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("RANGE_TOO_LARGE");
  });

  it("devuelve los totales por día del rango", async () => {
    mockRooms.listRoomDayStates.mockResolvedValueOnce([
      { roomId: "r1", date: "2026-10-05", published: true, reserved: true, occupied: false },
      { roomId: "r2", date: "2026-10-05", published: true, reserved: false, occupied: false },
      { roomId: "r3", date: "2026-10-06", published: false, reserved: false, occupied: true },
    ]);
    mockRooms.listRoomIdsInMaintenance.mockResolvedValueOnce(["r9"]);

    const res = await GET(request("?from=2026-10-05&to=2026-10-06"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.range).toEqual({ from: "2026-10-05", to: "2026-10-06" });
    expect(data.days).toHaveLength(2);
    expect(data.days[0]).toMatchObject({ date: "2026-10-05", published: 2, reserved: 1, occupied: 0, maintenance: 1 });
    expect(data.days[1]).toMatchObject({ date: "2026-10-06", published: 0, reserved: 0, occupied: 1, maintenance: 1 });
    expect(mockRooms.listRoomDayStates).toHaveBeenCalledWith("2026-10-05", "2026-10-06");
  });

  it("devuelve el detalle del día con todas las habitaciones y su resumen", async () => {
    mockRooms.listRooms.mockResolvedValueOnce([room("r1", 101), room("r2", 102), room("r3", 103)]);
    mockRooms.listRoomDayStates.mockResolvedValueOnce([
      { roomId: "r1", date: "2026-10-05", published: true, reserved: false, occupied: false },
      { roomId: "r2", date: "2026-10-05", published: false, reserved: true, occupied: false },
    ]);
    mockRooms.listRoomIdsInMaintenance.mockResolvedValueOnce(["r3"]);

    const res = await GET(request("?date=2026-10-05"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.date).toBe("2026-10-05");
    expect(data.rooms).toHaveLength(3);
    expect(data.rooms[0]).toMatchObject({ roomNumber: 101, published: true, reserved: false, maintenance: false });
    expect(data.rooms[1]).toMatchObject({ roomNumber: 102, published: false, reserved: true });
    expect(data.rooms[2]).toMatchObject({ roomNumber: 103, maintenance: true, published: false });
    expect(data.summary).toEqual({ published: 1, reserved: 1, occupied: 0, maintenance: 1 });
  });
});
