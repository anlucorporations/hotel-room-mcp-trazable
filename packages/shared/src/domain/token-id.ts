/**
 * Codificación determinística del `tokenId` y validación de fechas (Decisión 3, ADR-08).
 *
 * `tokenId = room · 10^8 + (AAAA·10^4 + MM·10^2 + DD)`.
 * Ej.: hab. 102, noche 2026-06-15 → `10220260615`.
 *
 * La validación de calendario (días/mes, bisiesto) es off-chain (defensa en profundidad);
 * el contrato recibirá `AAAAMMDD` ya validado y aplicará la regla de rango + expiración en
 * T1.1 (en FASE 0 el contrato es un esqueleto sin `mint`).
 */
const ROOM_MULTIPLIER = 100_000_000n; // 10^8

export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number; // 1–31
}

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

/** Compone `AAAAMMDD` a partir de una fecha civil (sin validar calendario). */
export function dateToYYYYMMDD({ year, month, day }: CivilDate): number {
  return year * 10_000 + month * 100 + day;
}

/** Descompone `AAAAMMDD` en su fecha civil. */
export function splitYYYYMMDD(yyyymmdd: number): CivilDate {
  return {
    year: Math.floor(yyyymmdd / 10_000),
    month: Math.floor((yyyymmdd % 10_000) / 100),
    day: yyyymmdd % 100,
  };
}

/**
 * Validación de rango (equivalente a la on-chain): AAAAMMDD de 8 dígitos (`< 10^8`, para que
 * quepa en la parte baja del `tokenId`), MM 1–12, DD 1–31.
 */
export function isDateInRange(yyyymmdd: number): boolean {
  if (yyyymmdd >= 100_000_000) return false;
  const { month, day } = splitYYYYMMDD(yyyymmdd);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Validación de calendario completa (rechaza 2026-02-30, 29-feb no bisiesto, etc.). */
export function isValidCalendarDate({ year, month, day }: CivilDate): boolean {
  if (!isPositiveInteger(year) || !isPositiveInteger(month) || !isPositiveInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12) return false;
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1] ?? 0;
  return day >= 1 && day <= maxDay;
}

/** Codifica el `tokenId` canónico. Lanza si la habitación o la fecha no son válidas. */
export function encodeTokenId(room: number, dateYYYYMMDD: number): bigint {
  if (!isPositiveInteger(room)) {
    throw new RangeError(`Habitación inválida: ${room}`);
  }
  if (!isPositiveInteger(dateYYYYMMDD) || !isDateInRange(dateYYYYMMDD)) {
    throw new RangeError(`Fecha AAAAMMDD inválida: ${dateYYYYMMDD}`);
  }
  return BigInt(room) * ROOM_MULTIPLIER + BigInt(dateYYYYMMDD);
}

/**
 * Descompone un `tokenId` en habitación y fecha. Asume un `tokenId` canónico (el inverso de
 * {@link encodeTokenId}); la validación de entrada se realiza al codificar y on-chain.
 */
export function decodeTokenId(tokenId: bigint): {
  room: number;
  dateYYYYMMDD: number;
} {
  return {
    room: Number(tokenId / ROOM_MULTIPLIER),
    dateYYYYMMDD: Number(tokenId % ROOM_MULTIPLIER),
  };
}
