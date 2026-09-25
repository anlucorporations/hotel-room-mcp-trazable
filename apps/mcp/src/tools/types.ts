import type { NightType, PurchaseTxData, SaleType } from "@hotel/shared";

/** Salida de `listAvailableNights` y de `checkAvailability` (precio en wei como string). */
export interface NightDescriptor {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  readonly priceWei: string;
  readonly saleType: SaleType;
}

/** Salida de `checkAvailability` (CU-08, docs/SRS.md §9): existencia + comprabilidad + precio si aplica. */
export interface AvailabilityResult {
  readonly exists: boolean;
  readonly available: boolean;
  readonly tokenId?: string;
  readonly priceWei?: string;
  readonly saleType?: SaleType;
}

/** Salida de `getOwnedNights` (sin precio: solo identidad de la noche). */
export interface OwnedNightDescriptor {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
}

/** Salida de `buildPurchaseTx`: datos de la tx **sin firmar** (ADR-11). */
export type { PurchaseTxData };
