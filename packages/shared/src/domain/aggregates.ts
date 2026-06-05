import type { NightType } from "./types";
import type { SaleType } from "./types";

/**
 * Contrato de datos del worker (agregados e histórico) que consume la web (CU-09/11, ADR-09).
 * Los importes monetarios viajan como `string` (wei) para no perder precisión en JSON.
 */

/** Métricas del dashboard (CU-11). */
export interface DashboardAggregates {
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
}

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
