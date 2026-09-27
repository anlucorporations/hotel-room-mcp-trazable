import { describe, expect, it } from "vitest";
import { ALL_ROOMS } from "./room-master";
import { buildRoomRegistrationPlan, buildRoomSeed } from "./room-registry";

describe("buildRoomSeed (F8 · D-3/D-14)", () => {
  const seed = buildRoomSeed();

  it("vuelca las 50 habitaciones del maestro, ordenadas", () => {
    expect(seed).toHaveLength(50);
    expect(seed.map((r) => r.roomNumber)).toEqual([...ALL_ROOMS]);
  });

  it("reparte los tres tipos por rango y asigna planta", () => {
    const byNumber = new Map(seed.map((r) => [r.roomNumber, r]));
    expect(byNumber.get(101)).toMatchObject({ roomType: "SIMPLE", floor: 0, capacity: 1, beds: 1 });
    expect(byNumber.get(115)).toMatchObject({ roomType: "SIMPLE", floor: 0 });
    expect(byNumber.get(116)).toMatchObject({ roomType: "DOBLE", floor: 0, capacity: 2, beds: 2 });
    expect(byNumber.get(130)).toMatchObject({ roomType: "DOBLE", floor: 0 });
    expect(byNumber.get(201)).toMatchObject({ roomType: "SUITE", floor: 1, capacity: 2, beds: 2 });
    expect(byNumber.get(220)).toMatchObject({ roomType: "SUITE", floor: 1 });
  });

  it("deja una descripción en español (publicable) y una tarifa base provisional", () => {
    for (const room of seed) {
      expect(room.descriptionEs.length).toBeGreaterThan(0);
      expect(BigInt(room.baseRateWei)).toBeGreaterThan(0n);
    }
  });

  it("falla si una habitación no pertenece al maestro", () => {
    expect(() => buildRoomSeed([999])).toThrow(/maestro/);
  });
});

describe("buildRoomRegistrationPlan (F8 · D-10)", () => {
  it("traduce el vocabulario de la BD al del contrato y ordena", () => {
    const plan = buildRoomRegistrationPlan([
      { roomNumber: 220, roomType: "SUITE" },
      { roomNumber: 101, roomType: "simple" },
      { roomNumber: 116, roomType: "DOBLE" },
    ]);
    expect(plan).toEqual([
      { room: 101, roomType: "simple" },
      { room: 116, roomType: "doble" },
      { room: 220, roomType: "suite" },
    ]);
  });

  it("descarta tipos desconocidos en lugar de registrar algo que el contrato rechazaría", () => {
    const plan = buildRoomRegistrationPlan([
      { roomNumber: 101, roomType: "SIMPLE" },
      { roomNumber: 102, roomType: "FAMILIAR" },
      { roomNumber: 103, roomType: "  suite  " },
    ]);
    expect(plan).toEqual([
      { room: 101, roomType: "simple" },
      { room: 103, roomType: "suite" },
    ]);
  });
});
