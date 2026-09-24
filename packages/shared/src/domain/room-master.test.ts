import { describe, expect, it } from "vitest";
import {
  ALL_ROOMS,
  ROOM_COUNT,
  isRoomInMaster,
  roomTypeOf,
  toNightType,
  toRoomTypeDb,
} from "./room-master";

describe("room-master", () => {
  it("contiene exactamente las 50 habitaciones del maestro", () => {
    expect(ROOM_COUNT).toBe(50);
    expect(ALL_ROOMS).toHaveLength(50);
    expect(ALL_ROOMS[0]).toBe(101);
    expect(ALL_ROOMS.at(-1)).toBe(220);
  });

  describe("isRoomInMaster", () => {
    it("acepta habitaciones de ambas plantas", () => {
      expect(isRoomInMaster(101)).toBe(true);
      expect(isRoomInMaster(130)).toBe(true);
      expect(isRoomInMaster(201)).toBe(true);
      expect(isRoomInMaster(220)).toBe(true);
    });
    it("rechaza habitaciones fuera del maestro", () => {
      expect(isRoomInMaster(100)).toBe(false);
      expect(isRoomInMaster(131)).toBe(false);
      expect(isRoomInMaster(200)).toBe(false);
      expect(isRoomInMaster(221)).toBe(false);
      expect(isRoomInMaster(999)).toBe(false);
    });
  });

  describe("roomTypeOf", () => {
    it("deriva el tipo por rango (propuesta ADR-02)", () => {
      expect(roomTypeOf(101)).toBe("simple");
      expect(roomTypeOf(115)).toBe("simple");
      expect(roomTypeOf(116)).toBe("doble");
      expect(roomTypeOf(130)).toBe("doble");
      expect(roomTypeOf(201)).toBe("suite");
      expect(roomTypeOf(220)).toBe("suite");
    });
    it("devuelve null fuera del maestro", () => {
      expect(roomTypeOf(999)).toBeNull();
    });
  });

  /**
   * Traducción dominio ↔ base de datos (M9). El tipo «doble» que pidió el cliente se perdía al
   * persistir porque cada punto de lectura hacía `=== "suite" ? "SUITE" : "SIMPLE"`: estas funciones
   * son el único sitio donde se traduce, y esta prueba fija que «doble» sobrevive al viaje.
   */
  describe("vocabulario de la base de datos", () => {
    it("traduce los tres tipos del maestro, en cualquier caja y con espacios", () => {
      expect(toRoomTypeDb("simple")).toBe("SIMPLE");
      expect(toRoomTypeDb("DOBLE")).toBe("DOBLE");
      expect(toRoomTypeDb(" Suite ")).toBe("SUITE");
    });

    it("no inventa un tipo cuando el valor no es del maestro", () => {
      expect(toRoomTypeDb("triple")).toBeNull();
      expect(toRoomTypeDb("")).toBeNull();
      expect(toRoomTypeDb(null)).toBeNull();
      expect(toRoomTypeDb(undefined)).toBeNull();
    });

    it("el viaje de ida y vuelta conserva el tipo (incluido «doble»)", () => {
      for (const room of ALL_ROOMS) {
        const type = roomTypeOf(room);
        expect(type).not.toBeNull();
        const db = toRoomTypeDb(type);
        expect(db).not.toBeNull();
        expect(toNightType(db)).toBe(type);
        // El tipo persistido tiene que coincidir con el del maestro para ESA habitación.
        expect(toNightType(db)).toBe(roomTypeOf(room));
      }
      expect(toNightType("DOBLE")).toBe("doble");
    });
  });
});
