import { CATALOG_WINDOW_DAYS } from "../constants";
import { ALL_ROOMS, roomTypeOf } from "../domain/room-master";
import { dateToYYYYMMDD, encodeTokenId, type CivilDate } from "../domain/token-id";
import type { NightType } from "../domain/types";

/**
 * Generador determinista de fixtures de noches (T0.3): catálogo 50×90 reproducible para
 * desarrollo/CI. Es **puro** (misma entrada → misma salida); la aplicación on-chain (mint
 * por el rol MINTER) llega en T1.1, y la prefinanciación de wallets vía faucet en dev.
 */
const ONE_ETH = 10n ** 18n;

/** Precios de ejemplo por tipo (dev). El precio real lo fija el hotel (DISEÑO §16.6). */
export const SEED_PRICE_BY_TYPE: Readonly<Record<NightType, bigint>> = Object.freeze({
  simple: ONE_ETH / 20n, // 0,05 ETH
  doble: ONE_ETH / 10n, // 0,1 ETH
  suite: (ONE_ETH * 3n) / 10n, // 0,3 ETH
});

export interface NightFixture {
  readonly tokenId: bigint;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: NightType;
  readonly priceWei: bigint;
}

export interface SeedPlanOptions {
  /** Primera noche del catálogo (fecha de entrada). */
  readonly startDate: CivilDate;
  /** Número de noches consecutivas por habitación (default `CATALOG_WINDOW_DAYS`). */
  readonly days?: number;
}

export interface SeedPlan {
  readonly nights: readonly NightFixture[];
  /** Subconjunto de ejemplo con venta primaria simulada. */
  readonly soldTokenIds: readonly bigint[];
  /** Subconjunto de ejemplo listado en el mercado secundario. */
  readonly listedTokenIds: readonly bigint[];
}

function addDays(start: CivilDate, days: number): CivilDate {
  const date = new Date(Date.UTC(start.year, start.month - 1, start.day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** Genera el catálogo determinista (habitaciones del maestro × `days` noches). */
export function generateNightFixtures({
  startDate,
  days = CATALOG_WINDOW_DAYS,
}: SeedPlanOptions): NightFixture[] {
  const nights: NightFixture[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateYYYYMMDD = dateToYYYYMMDD(addDays(startDate, offset));
    for (const room of ALL_ROOMS) {
      const roomType = roomTypeOf(room);
      if (!roomType) continue;
      nights.push({
        tokenId: encodeTokenId(room, dateYYYYMMDD),
        room,
        dateYYYYMMDD,
        roomType,
        priceWei: SEED_PRICE_BY_TYPE[roomType],
      });
    }
  }
  return nights;
}

/**
 * Construye un plan de seed completo y determinista: catálogo + subconjuntos de ejemplo
 * vendidos y listados (selección por stride para repartirlos de forma estable).
 */
export function buildSeedPlan(options: SeedPlanOptions): SeedPlan {
  const nights = generateNightFixtures(options);
  const soldTokenIds = nights.filter((_, i) => i % 47 === 0).map((n) => n.tokenId);
  const listedTokenIds = soldTokenIds.filter((_, i) => i % 3 === 0);
  return { nights, soldTokenIds, listedTokenIds };
}
