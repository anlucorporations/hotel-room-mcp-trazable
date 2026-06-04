import type { NightType } from "./types";

/**
 * Maestro de habitaciones (RF-18a, DISEÑO §5).
 *
 * Inventario físico: planta baja 101–130 y primera planta 201–220 (50 habitaciones).
 * Reparto habitación→tipo (propuesta; confirmar el reparto real con el hotel, DISEÑO §16.5).
 *
 * Estos rangos son la fuente única off-chain y deberán coincidir con la validación on-chain
 * del contrato (`RoomNotInMaster`), que se implementa en T1.1 (en FASE 0 el contrato es un
 * esqueleto sin `mint`).
 */
export const GROUND_FLOOR = { min: 101, max: 130 } as const;
export const FIRST_FLOOR = { min: 201, max: 220 } as const;

interface RoomTypeRange {
  readonly min: number;
  readonly max: number;
  readonly type: NightType;
}

const ROOM_TYPE_RANGES: readonly RoomTypeRange[] = [
  { min: 101, max: 115, type: "simple" },
  { min: 116, max: 130, type: "doble" },
  { min: 201, max: 220, type: "suite" },
];

const isInRange = (value: number, range: { min: number; max: number }): boolean =>
  Number.isInteger(value) && value >= range.min && value <= range.max;

/** ¿La habitación pertenece al inventario del hotel? */
export function isRoomInMaster(room: number): boolean {
  return isInRange(room, GROUND_FLOOR) || isInRange(room, FIRST_FLOOR);
}

/** Tipo de la habitación, o `null` si no está en el maestro. */
export function roomTypeOf(room: number): NightType | null {
  const match = ROOM_TYPE_RANGES.find((range) => isInRange(room, range));
  return match?.type ?? null;
}

const buildRoomList = (): readonly number[] => {
  const rooms: number[] = [];
  for (let room = GROUND_FLOOR.min; room <= GROUND_FLOOR.max; room += 1) rooms.push(room);
  for (let room = FIRST_FLOOR.min; room <= FIRST_FLOOR.max; room += 1) rooms.push(room);
  return rooms;
};

/** Las 50 habitaciones del maestro, ascendentes. */
export const ALL_ROOMS: readonly number[] = buildRoomList();

/** Total de habitaciones del maestro (= 50). */
export const ROOM_COUNT = ALL_ROOMS.length;
