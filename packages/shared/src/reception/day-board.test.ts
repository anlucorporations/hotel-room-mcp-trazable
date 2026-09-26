import { describe, expect, it } from "vitest";
import { ALL_ROOMS, ROOM_COUNT } from "../domain/room-master";
import { buildRoomBoard, roomBoardStatus } from "./day-board";

/**
 * CU-31 / RF-32: el panel debe mostrar exactamente las 50 habitaciones del maestro y traducir el
 * estado del índice a un estado operativo comprensible en el mostrador.
 */
describe("Panel del día de recepción (RF-31/RF-32)", () => {
  it("traduce cada estado del índice al del panel", () => {
    expect(roomBoardStatus("SOLD")).toBe("RESERVADA");
    expect(roomBoardStatus("CHECKED_IN")).toBe("OCUPADA");
    expect(roomBoardStatus("CHECKED_OUT")).toBe("SALIDA");
    expect(roomBoardStatus("CONFIRMING")).toBe("PENDIENTE");
    expect(roomBoardStatus("BURNED")).toBe("BLOQUEADA");
    expect(roomBoardStatus("AVAILABLE")).toBe("LIBRE");
    expect(roomBoardStatus("LO_QUE_SEA")).toBe("LIBRE");
  });

  it("devuelve las 50 habitaciones del maestro aunque no haya ninguna noche", () => {
    const board = buildRoomBoard(ALL_ROOMS, []);
    expect(board).toHaveLength(ROOM_COUNT);
    expect(board.every((cell) => cell.status === "LIBRE")).toBe(true);
    expect(board[0].roomNumber).toBe(101);
  });

  it("marca ocupada solo la habitación con check-in", () => {
    const board = buildRoomBoard(ALL_ROOMS, [
      { roomNumber: 101, status: "SOLD" },
      { roomNumber: 116, status: "CHECKED_IN" },
      { roomNumber: 201, status: "BURNED" },
    ]);

    const byRoom = new Map(board.map((cell) => [cell.roomNumber, cell.status]));
    expect(byRoom.get(101)).toBe("RESERVADA");
    expect(byRoom.get(116)).toBe("OCUPADA");
    expect(byRoom.get(201)).toBe("BLOQUEADA");
    expect(byRoom.get(102)).toBe("LIBRE");
  });

  it("asigna el tipo del maestro a cada habitación", () => {
    const board = buildRoomBoard([101, 116, 201], []);
    expect(board.map((cell) => cell.roomType)).toEqual(["simple", "doble", "suite"]);
  });

  it("ante filas duplicadas de la misma habitación gana la de mayor severidad", () => {
    const board = buildRoomBoard([101], [
      { roomNumber: 101, status: "SOLD" },
      { roomNumber: 101, status: "CHECKED_IN" },
    ]);
    expect(board[0].status).toBe("OCUPADA");
  });
});
