import { describe, expect, it } from "vitest";
import {
  ALL_ROOMS,
  ROOM_COUNT,
  isRoomInMaster,
  roomTypeOf,
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
    it("deriva el tipo por rango (propuesta DISEÑO §5)", () => {
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
});
