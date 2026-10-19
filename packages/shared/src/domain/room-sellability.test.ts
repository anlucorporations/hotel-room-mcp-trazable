import { describe, expect, it } from "vitest";
import { isRoomSellable, sellableRoomNumbers, type SellableRoomInput } from "./room-sellability";

const room = (overrides: Partial<SellableRoomInput> = {}): SellableRoomInput => ({
  id: "room-101",
  roomNumber: 101,
  publicationStatus: "PUBLISHED",
  archivedAt: null,
  ...overrides,
});

const noBlocks = new Set<string>();

describe("isRoomSellable (regla única del canal público)", () => {
  it("una habitación publicada, vigente y sin bloqueo es vendible", () => {
    expect(isRoomSellable(room(), noBlocks)).toBe(true);
  });

  it("solo PUBLISHED se vende: DRAFT, PAUSED, MAINTENANCE y OUT_OF_SERVICE no", () => {
    for (const status of ["DRAFT", "PAUSED", "MAINTENANCE", "OUT_OF_SERVICE"] as const) {
      expect(isRoomSellable(room({ publicationStatus: status }), noBlocks)).toBe(false);
    }
  });

  it("una habitación archivada no se vende aunque siga marcada PUBLISHED", () => {
    expect(isRoomSellable(room({ archivedAt: new Date("2026-10-01T00:00:00Z") }), noBlocks)).toBe(
      false,
    );
  });

  it("una avería abierta saca la habitación del canal público (D-53)", () => {
    expect(isRoomSellable(room(), new Set(["room-101"]))).toBe(false);
  });

  it("el bloqueo se compara por id, no por número", () => {
    expect(isRoomSellable(room(), new Set(["otra-habitacion"]))).toBe(true);
  });
});

describe("sellableRoomNumbers (intersección con el maestro administrado)", () => {
  it("devuelve solo los números publicados y no bloqueados", () => {
    const numbers = sellableRoomNumbers(
      [
        room({ id: "a", roomNumber: 101 }),
        room({ id: "b", roomNumber: 116, publicationStatus: "DRAFT" }),
        room({ id: "c", roomNumber: 201 }),
        room({ id: "d", roomNumber: 202, archivedAt: "2026-10-01T00:00:00.000Z" }),
      ],
      new Set(["c"]),
    );
    expect([...numbers]).toEqual([101]);
  });

  it("un maestro vacío devuelve un conjunto vacío (catálogo honestamente vacío)", () => {
    expect(sellableRoomNumbers([], new Set())).toEqual(new Set());
  });
});
