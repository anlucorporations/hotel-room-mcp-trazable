import type { NightType } from "./types";
import type { SaleType } from "./types";

/**
 * Contrato de datos del worker (agregados e histórico) que consume la web (CU-09/11, docs/SRS.md §9, ADR-09).
 * Los importes monetarios viajan como `string` (wei) para no perder precisión en JSON.
 */

/**
 * Clave de tipo de habitación que admite el dashboard. Además de los tipos del maestro
 * (`NightType`) el histórico puede contener habitaciones fuera del maestro (`roomTypeOf` → `null`),
 * que se persisten como `"desconocido"`; nombrarlas explícitamente evita una mentira de tipo
 * (un `as NightType` sobre un valor que no lo es).
 */
export type RoomTypeKey = NightType | "desconocido";

/** Orden canónico del desglose por tipo (estable entre ejecuciones: el gráfico no baila). */
export const ROOM_TYPE_ORDER: readonly RoomTypeKey[] = [
  "simple",
  "doble",
  "suite",
  "desconocido",
];

/** Un punto de la serie mensual (D-16): mes natural en la zona horaria del hotel. */
export interface MonthlySalesPoint {
  /** Mes natural `YYYY-MM` (zona horaria indicada por `DashboardAggregates.timeZone`). */
  readonly month: string;
  /** Σ precio de las ventas primarias de ese mes. */
  readonly primaryVolumeWei: string;
  /** Σ precio de las reventas de ese mes. */
  readonly secondaryVolumeWei: string;
  /** Nº de ventas primarias del mes. */
  readonly primarySales: number;
  /** Nº de reventas del mes. */
  readonly secondarySales: number;
}

/** Desglose por tipo de habitación (D-16): volumen y número de ventas de cada tipo. */
export interface RoomTypeBreakdownEntry {
  readonly roomType: RoomTypeKey;
  readonly primarySales: number;
  readonly secondarySales: number;
  readonly primaryVolumeWei: string;
  readonly secondaryVolumeWei: string;
  /** Σ primaria + secundaria (derivado; se envía calculado para que la UI no reinterprete wei). */
  readonly totalVolumeWei: string;
}

/** Una noche del ranking de más revendidas (D-16): reventas de un mismo `tokenId`. */
export interface TopResoldNight {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: RoomTypeKey;
  /** Nº de reventas de esa noche (ventas secundarias). Siempre ≥ 1. */
  readonly resaleCount: number;
  /** Σ precio de esas reventas. */
  readonly resaleVolumeWei: string;
}

/**
 * Agregados derivados del histórico (D-16). Se calculan en PostgreSQL dentro del worker (D-09) y
 * `summarizeHistory()` permite rederivarlos desde `/history` para comprobar que **cuadran**
 * (criterio de aceptación de M7): la misma magnitud por dos caminos independientes.
 */
export interface HistorySummary {
  /** Serie mensual ascendente por mes. */
  readonly monthlySeries: readonly MonthlySalesPoint[];
  /** Desglose por tipo en `ROOM_TYPE_ORDER` (solo los tipos con actividad). */
  readonly roomTypeBreakdown: readonly RoomTypeBreakdownEntry[];
  /** Ranking de noches más revendidas (máx. `TOP_RESOLD_LIMIT`). */
  readonly topResold: readonly TopResoldNight[];
  /**
   * Ventas del histórico **sin** marca temporal de bloque (filas anteriores a la columna
   * `block_timestamp` o eventos sin ella). Quedan FUERA de la serie mensual, y este contador lo
   * declara para que la diferencia sea auditable en lugar de invisible.
   */
  readonly undatedSalesCount: number;
}

/** Métricas del dashboard (CU-11 + D-16). */
export interface DashboardAggregates extends HistorySummary {
  /** Σ precio de ventas primarias (importe vendido por el hotel). */
  readonly primaryVolumeWei: string;
  /** Σ amount de `RoyaltyPaid` (solo ventas secundarias). */
  readonly royaltiesWei: string;
  /** Σ precio de ventas secundarias (volumen de reventa). */
  readonly secondaryVolumeWei: string;
  /** Nº de noches vendidas (ventas primarias). */
  readonly soldCount: number;
  /** Nº de noches minteadas. */
  readonly mintedCount: number;
  /** Nº de noches quemadas. */
  readonly burnedCount: number;
  /** Ocupación comercial = soldCount / mintedCount, en %. 0 si mintedCount = 0 (sin NaN). */
  readonly occupancyRatioPercent: number;
  /** Último bloque agregado (periodo: deploymentBlock..lastBlock). */
  readonly lastBlock: number;
  /** Zona horaria con la que se agruparon los meses (se declara: los meses no son UTC por azar). */
  readonly timeZone: string;
}

/** Una venta del histórico público (CU-09). Sin PII: solo wallets, habitación, fecha, precio. */
export interface SaleHistoryEntry {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly roomType: NightType;
  readonly priceWei: string;
  readonly saleType: SaleType;
  readonly seller: string;
  readonly buyer: string;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: string;
  /**
   * Marca temporal del bloque en segundos UNIX (UTC), o `null` si la fila no la tiene
   * (histórico anterior a la migración de M7). La serie mensual la necesita para saber a qué mes
   * pertenece cada venta.
   */
  readonly blockTimestamp: number | null;
}

/** Zona horaria por defecto para agrupar los meses (hora local del hotel, Europe/Madrid). */
export const DASHBOARD_TIME_ZONE = "Europe/Madrid";

/** Máximo de noches del ranking de más revendidas (D-16). */
export const TOP_RESOLD_LIMIT = 10;

/** Calcula el ratio de ocupación comercial en % (CU-11: div/0 → 0, sin NaN). */
export function occupancyRatioPercent(soldCount: number, mintedCount: number): number {
  if (mintedCount <= 0) return 0;
  return (soldCount / mintedCount) * 100;
}

/**
 * Orden total del histórico (CU-09): descendente por bloque y, en empate, por logIndex
 * descendente. Función pura para compartir el criterio entre worker y tests.
 */
export function compareHistoryDesc(a: SaleHistoryEntry, b: SaleHistoryEntry): number {
  if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
  return b.logIndex - a.logIndex;
}

/**
 * Mes natural (`YYYY-MM`) de un instante UNIX en una zona horaria IANA concreta.
 *
 * Se usa `Intl` (y no `Date.getMonth()`) porque el mes del hotel no es el mes UTC: una venta de
 * las 23:30 del 31 de enero en Madrid pertenece a enero, aunque en UTC ya sea febrero. El test de
 * cuadre con el SQL (`date_trunc('month', block_timestamp AT TIME ZONE $tz)`) es lo que garantiza
 * que ambos caminos coinciden.
 */
export function monthInTimeZone(timestampSeconds: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestampSeconds * 1000));
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/**
 * Deriva del histórico los agregados de D-16 (serie mensual, desglose por tipo y ranking de más
 * revendidas). Es la vía INDEPENDIENTE del SQL del worker: sirve para comprobar que las cifras del
 * dashboard cuadran con el histórico (criterio de aceptación de M7) sin reutilizar su consulta.
 *
 * Determinismo: la serie va por mes ascendente, el desglose en `ROOM_TYPE_ORDER` y el ranking por
 * (reventas desc, volumen desc, tokenId asc) — un orden total, sin empates arbitrarios.
 */
export function summarizeHistory(
  entries: readonly SaleHistoryEntry[],
  timeZone: string = DASHBOARD_TIME_ZONE,
  topLimit: number = TOP_RESOLD_LIMIT,
): HistorySummary {
  const months = new Map<string, { pv: bigint; sv: bigint; pc: number; sc: number }>();
  const types = new Map<RoomTypeKey, { pv: bigint; sv: bigint; pc: number; sc: number }>();
  const resold = new Map<
    string,
    { room: number; dateYYYYMMDD: number; roomType: RoomTypeKey; count: number; volume: bigint }
  >();
  let undatedSalesCount = 0;

  for (const entry of entries) {
    const isSecondary = entry.saleType === "SECONDARY";
    const price = BigInt(entry.priceWei);
    const roomType = asRoomTypeKey(entry.roomType);

    if (entry.blockTimestamp === null) {
      undatedSalesCount += 1;
    } else {
      const month = monthInTimeZone(entry.blockTimestamp, timeZone);
      const bucket = months.get(month) ?? { pv: 0n, sv: 0n, pc: 0, sc: 0 };
      if (isSecondary) {
        bucket.sv += price;
        bucket.sc += 1;
      } else {
        bucket.pv += price;
        bucket.pc += 1;
      }
      months.set(month, bucket);
    }

    const typeBucket = types.get(roomType) ?? { pv: 0n, sv: 0n, pc: 0, sc: 0 };
    if (isSecondary) {
      typeBucket.sv += price;
      typeBucket.sc += 1;
    } else {
      typeBucket.pv += price;
      typeBucket.pc += 1;
    }
    types.set(roomType, typeBucket);

    if (isSecondary) {
      const current = resold.get(entry.tokenId) ?? {
        room: entry.room,
        dateYYYYMMDD: entry.dateYYYYMMDD,
        roomType,
        count: 0,
        volume: 0n,
      };
      current.count += 1;
      current.volume += price;
      resold.set(entry.tokenId, current);
    }
  }

  const monthlySeries: MonthlySalesPoint[] = [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, b]) => ({
      month,
      primaryVolumeWei: b.pv.toString(),
      secondaryVolumeWei: b.sv.toString(),
      primarySales: b.pc,
      secondarySales: b.sc,
    }));

  const roomTypeBreakdown: RoomTypeBreakdownEntry[] = ROOM_TYPE_ORDER.filter((type) =>
    types.has(type),
  ).map((roomType) => {
    const b = types.get(roomType)!;
    return {
      roomType,
      primarySales: b.pc,
      secondarySales: b.sc,
      primaryVolumeWei: b.pv.toString(),
      secondaryVolumeWei: b.sv.toString(),
      totalVolumeWei: (b.pv + b.sv).toString(),
    };
  });

  const topResold: TopResoldNight[] = [...resold.entries()]
    .map(([tokenId, v]) => ({
      tokenId,
      room: v.room,
      dateYYYYMMDD: v.dateYYYYMMDD,
      roomType: v.roomType,
      resaleCount: v.count,
      resaleVolumeWei: v.volume.toString(),
    }))
    .sort(
      (a, b) =>
        b.resaleCount - a.resaleCount ||
        compareBigIntDesc(a.resaleVolumeWei, b.resaleVolumeWei) ||
        // Desempate numérico (no lexicográfico) por tokenId: `"9" < "10"` como número, y es el
        // mismo criterio que el `token_id::NUMERIC ASC` del SQL del worker, de modo que las dos
        // vías producen exactamente la misma lista.
        compareBigIntAsc(a.tokenId, b.tokenId),
    )
    .slice(0, topLimit);

  return { monthlySeries, roomTypeBreakdown, topResold, undatedSalesCount };
}

const compareBigIntDesc = (a: string, b: string): number => {
  const left = BigInt(a);
  const right = BigInt(b);
  return left === right ? 0 : left > right ? -1 : 1;
};

const compareBigIntAsc = (a: string, b: string): number => {
  const left = BigInt(a);
  const right = BigInt(b);
  return left === right ? 0 : left < right ? -1 : 1;
};

/** Normaliza el tipo persistido al vocabulario del dashboard (`null`/vacío → `desconocido`). */
export function asRoomTypeKey(value: string | null | undefined): RoomTypeKey {
  return value === "simple" || value === "doble" || value === "suite" ? value : "desconocido";
}
