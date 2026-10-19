import { describe, expect, it } from "vitest";
import {
  buildRoomStateBoard,
  inspectionEffects,
  parseBooleanFlag,
  requiresInspectionSignature,
  roomStateToken,
  summarizeRoomStates,
  type RoomStateInput,
} from "./housekeeping";

const room = (overrides: Partial<RoomStateInput> = {}): RoomStateInput => ({
  roomId: "room-101",
  roomNumber: 101,
  roomType: "SIMPLE",
  operationalStatus: "CLEAN",
  publicationStatus: "PUBLISHED",
  blockedByMaintenance: false,
  ...overrides,
});

describe("inspección (F6 · T6.4/T6.6 · D-C9/C15/C23)", () => {
  it("la firma de inspección es opcional por defecto: solo se exige con el flag activo", () => {
    expect(requiresInspectionSignature(undefined)).toBe(false);
    expect(requiresInspectionSignature(null)).toBe(false);
    expect(requiresInspectionSignature("false")).toBe(false);
    expect(requiresInspectionSignature("true")).toBe(true);
    expect(requiresInspectionSignature("1")).toBe(true);
    expect(requiresInspectionSignature("on")).toBe(true);
    expect(parseBooleanFlag("YES")).toBe(true);
  });

  it("APPROVED deja la habitación CLEAN y no reasigna", () => {
    expect(inspectionEffects("APPROVED")).toEqual({
      roomOperationalStatus: "CLEAN",
      reassign: false,
    });
  });

  it("REJECTED devuelve la habitación a DIRTY y manda la asignación a retrabajo", () => {
    expect(inspectionEffects("REJECTED")).toEqual({
      roomOperationalStatus: "DIRTY",
      reassign: true,
    });
  });
});

describe("tablero de estado operativo (F6 · T6.2/T6.5)", () => {
  it("resuelve los cinco estados canónicos", () => {
    for (const status of ["CLEAN", "DIRTY", "OCCUPIED", "PENDING_CLEANING", "IN_INSPECTION"] as const) {
      expect(roomStateToken(room({ operationalStatus: status }))).toBe(status);
    }
  });

  it("la marca de mantenimiento manda sobre el estado operativo", () => {
    expect(roomStateToken(room({ operationalStatus: "CLEAN", blockedByMaintenance: true }))).toBe(
      "MAINTENANCE",
    );
    expect(
      roomStateToken(room({ operationalStatus: "DIRTY", publicationStatus: "MAINTENANCE" })),
    ).toBe("MAINTENANCE");
  });

  it("ordena por número y cuenta por estado", () => {
    const rooms = [
      room({ roomId: "b", roomNumber: 202, operationalStatus: "DIRTY" }),
      room({ roomId: "a", roomNumber: 101, operationalStatus: "OCCUPIED" }),
      room({ roomId: "c", roomNumber: 150, blockedByMaintenance: true }),
    ];
    const board = buildRoomStateBoard(rooms);
    expect(board.map((entry) => entry.roomNumber)).toEqual([101, 150, 202]);
    expect(board.map((entry) => entry.state)).toEqual(["OCCUPIED", "MAINTENANCE", "DIRTY"]);
    const summary = summarizeRoomStates(rooms);
    expect(summary.OCCUPIED).toBe(1);
    expect(summary.DIRTY).toBe(1);
    expect(summary.MAINTENANCE).toBe(1);
    expect(summary.CLEAN).toBe(0);
  });
});
