import { dateToYYYYMMDD, encodeTokenId, splitYYYYMMDD } from "./token-id";
import type { NightType } from "./types";

/**
 * Ventana global de acuñación (F8 · D-4, D-11, D-16, D-17).
 *
 * Para cada habitación **publicada** deben existir las noches desde `hoy + 1` hasta
 * `hoy + mint_window_days`. El proceso es **idempotente** (D-16): la identidad de una noche es su
 * `tokenId` canónico y solo se acuñan las que faltan; repetir es seguro y reanudable.
 *
 * Lógica **pura** (sin red ni `node:*`): la consulta de qué está acuñado entra como predicado
 * (`isMinted`), de modo que la web, los scripts y las pruebas compartan el mismo cálculo.
 */

/** Noches mínimas libres por habitación antes de avisar del agotamiento (D-17). */
export const MINT_WINDOW_LOW_THRESHOLD = 7;

export interface MintWindowNight {
  dateYYYYMMDD: number;
  tokenId: bigint;
}

export interface BuildMintWindowOptions {
  room: number;
  roomType: NightType;
  /** «Hoy» en `AAAAMMDD`, en el reloj de la cadena o el del hotel (UTC). */
  todayYYYYMMDD: number;
  /** Días de la ventana (`mint_window_days`, D-11). Un valor no positivo devuelve `[]`. */
  windowDays: number;
  /** ¿La noche ya existe? Por defecto, ninguna (ventana completa). */
  isMinted?: (tokenId: bigint) => boolean;
}

/** Suma (o resta, con `days` negativo) días a una fecha `AAAAMMDD`, en UTC. */
export function addDaysYYYYMMDD(yyyymmdd: number, days: number): number {
  const { year, month, day } = splitYYYYMMDD(yyyymmdd);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return dateToYYYYMMDD({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** «Hoy» como `AAAAMMDD` en UTC. */
export function todayYYYYMMDDUtc(now: Date = new Date()): number {
  return dateToYYYYMMDD({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });
}

/**
 * Noches de la ventana que **faltan** por acuñar, de la más próxima a la más lejana. La primera
 * noche es `hoy + 1` (el día en curso ya no es vendible).
 */
export function buildMintWindow(options: BuildMintWindowOptions): MintWindowNight[] {
  const { room, todayYYYYMMDD, windowDays, isMinted = () => false } = options;
  if (!Number.isInteger(windowDays) || windowDays <= 0) return [];

  const nights: MintWindowNight[] = [];
  for (let offset = 1; offset <= windowDays; offset += 1) {
    const dateYYYYMMDD = addDaysYYYYMMDD(todayYYYYMMDD, offset);
    const tokenId = encodeTokenId(room, dateYYYYMMDD);
    if (isMinted(tokenId)) continue;
    nights.push({ dateYYYYMMDD, tokenId });
  }
  return nights;
}

export interface MintWindowStatus {
  windowDays: number;
  /** Noches de la ventana que aún no existen (0 = ventana completa). */
  missing: number;
  /** Noches existentes y todavía sin vender. */
  freeNights: number;
  /** `true` si quedan menos noches libres que el umbral: aviso de agotamiento (D-17). */
  low: boolean;
}

/** Deriva el estado/aviso de la ventana a partir del recuento (D-17). */
export function deriveMintWindowStatus(input: {
  windowDays: number;
  missing: number;
  freeNights: number;
  threshold?: number;
}): MintWindowStatus {
  const threshold = input.threshold ?? MINT_WINDOW_LOW_THRESHOLD;
  return {
    windowDays: input.windowDays,
    missing: input.missing,
    freeNights: input.freeNights,
    low: input.freeNights < threshold,
  };
}
