import type { Address } from "viem";

/**
 * Puerto de lectura de la cadena para las herramientas del MCP (DIP). Las tools dependen de
 * esta abstracción, no de viem: así su lógica de dominio se prueba con un doble determinista
 * y el adaptador real (`ViemChainReader`) se valida contra Anvil. El MCP es **solo lectura**.
 */

/** Una noche minteada (del evento `Mint`). */
export interface MintRecord {
  readonly tokenId: bigint;
  readonly room: number;
  readonly dateYYYYMMDD: number;
  readonly priceWei: bigint;
}

/** Señales on-chain de una noche para derivar su estado (CASOS §4) y su precio. */
export interface NightSignals {
  readonly exists: boolean;
  readonly soldOnce: boolean;
  readonly expired: boolean;
  readonly listed: boolean;
  /** Precio primario (`priceOf`). */
  readonly primaryPriceWei: bigint;
  /** Precio del listado de reventa (`listingOf.price`); 0 si no está listada. */
  readonly listingPriceWei: bigint;
}

export interface ChainReader {
  /** Bloque cabeza actual; sondea la conectividad con el RPC (para `/health`). */
  getHeadBlock(): Promise<bigint>;
  /** Todas las noches minteadas desde el bloque de despliegue (eventos `Mint`). */
  getMintRecords(): Promise<MintRecord[]>;
  /** `tokenId`s con al menos una venta (eventos `Sale`), como conjunto de strings. */
  getSoldTokenIds(): Promise<Set<string>>;
  /** `tokenId`s con algún evento `Listed` (candidatos a reventa). */
  getListedTokenIds(): Promise<bigint[]>;
  /** `tokenId`s comprados por una wallet (`Sale.buyer`, topic indexado). */
  getPurchasedTokenIds(wallet: Address): Promise<bigint[]>;
  /** Señales on-chain de una noche; `exists=false` si `ownerOf` revierte (no minteada/quemada). */
  getNightSignals(tokenId: bigint): Promise<NightSignals>;
  /** ¿`wallet` es la propietaria actual de `tokenId`? Tolera el revert por quemado. */
  isOwnedBy(tokenId: bigint, wallet: Address): Promise<boolean>;
}
