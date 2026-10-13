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

/**
 * Una noche de una **estancia** preparada (salida de `prepareStayTx`): los datos de la noche y su
 * transacción de compra, **sin firmar**. Cada noche es una compra distinta con su propia firma.
 */
export interface StayNightDescriptor {
  readonly tokenId: string;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly type: NightType;
  readonly priceWei: string;
  readonly saleType: SaleType;
  readonly tx: PurchaseTxData;
}

/**
 * Salida de `prepareStayTx` («reserva en rango de fechas»): la estancia **completa** en **una sola
 * habitación**, con una tx por noche y el importe total. Si alguna noche no fuera comprable, la
 * herramienta **no devuelve plan**: el asistente ofrece alternativas con `listAvailableNights`.
 */
export interface StayPlan {
  readonly room: number;
  readonly checkIn: number;
  readonly checkOut: number;
  readonly nights: StayNightDescriptor[];
  readonly totalPriceWei: string;
}
