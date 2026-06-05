import {
  compareHistoryDesc,
  GETLOGS_MAX_RANGE,
  occupancyRatioPercent,
  type DashboardAggregates,
  type NightType,
  type SaleHistoryEntry,
  type SaleType,
} from "@hotel/shared";
import type {
  AggregateStore,
  ChainSource,
  ChainEvent,
  HistoryRow,
} from "./types";

/**
 * Núcleo de agregados/histórico (FASE 3, T3.1/T3.2, CU-09/11, ADR-09).
 *
 * Recibe lotes de eventos de dominio (`Mint`/`Sale`/`RoyaltyPaid`/`Burn`) y los aplica al
 * `AggregateStore` de forma idempotente (la idempotencia real la garantiza el store, por clave
 * `txHash:logIndex`). Expone el contrato público que consume la web:
 *   - `getAggregates()`: `DashboardAggregates` (ratio con `occupancyRatioPercent`; royalties solo
 *     de `RoyaltyPaid`/secundarias).
 *   - `getHistory()`: `SaleHistoryEntry[]` con orden total (`compareHistoryDesc`) y sin PII (solo
 *     wallets). El histórico deriva de eventos `Sale`, no de `ownerOf`: una venta de un token
 *     luego quemado SIGUE en el histórico.
 *
 * No conoce viem ni SQLite: recibe su `AggregateStore` por construcción (DIP), por lo que es
 * testeable con fakes o con el store real de SQLite (`:memory:`).
 */
export interface AggregateProcessorDeps {
  readonly chainSource: ChainSource;
  readonly store: AggregateStore;
  /** Bloque de despliegue: límite inferior del catch-up (DISEÑO §14). */
  readonly deploymentBlock: number;
}

export class AggregateProcessor {
  private readonly chainSource: ChainSource;
  private readonly store: AggregateStore;
  private readonly deploymentBlock: number;

  constructor(deps: AggregateProcessorDeps) {
    this.chainSource = deps.chainSource;
    this.store = deps.store;
    this.deploymentBlock = deps.deploymentBlock;
  }

  /**
   * Procesa los eventos de dominio desde `max(lastBlock+1, deploymentBlock)` hasta `head`, en
   * chunks ≤ `GETLOGS_MAX_RANGE`, avanzando `lastBlock` tras cada chunk. La lectura del RPC
   * (`getDomainLogs`) puede lanzar: el error se propaga al llamador (`runCycle`), que lo cuenta
   * como fallo del RPC y no avanza el `lastBlock` del chunk.
   *
   * Idempotente: cada evento se aplica con clave `txHash:logIndex`; reprocesos/solapes no duplican.
   */
  async catchUp(headBlock: bigint): Promise<bigint> {
    const lastBlock = this.store.getCounters().lastBlock;
    // `lastBlock = 0` puede ser "nada agregado aún": arrancamos en el deploymentBlock.
    const resumeFrom = lastBlock === 0 ? this.deploymentBlock : lastBlock + 1;
    let fromBlock = BigInt(Math.max(resumeFrom, this.deploymentBlock));

    if (fromBlock > headBlock) {
      return headBlock;
    }

    while (fromBlock <= headBlock) {
      const toBlock = minBigInt(
        fromBlock + BigInt(GETLOGS_MAX_RANGE - 1),
        headBlock,
      );
      const events = await this.chainSource.getDomainLogs(fromBlock, toBlock);
      this.apply(events);
      this.store.setLastBlock(Number(toBlock));
      fromBlock = toBlock + 1n;
    }

    return headBlock;
  }

  /**
   * Aplica un lote de eventos al store (idempotente). Devuelve cuántos se contabilizaron ahora
   * (primera vez); los duplicados (ya aplicados) se ignoran sin efecto.
   */
  apply(events: readonly ChainEvent[]): number {
    let applied = 0;
    for (const event of events) {
      if (this.store.applyEvent(event)) {
        applied += 1;
      }
    }
    return applied;
  }

  /** Fija el último bloque agregado (periodo deploymentBlock..lastBlock). */
  setLastBlock(block: number): void {
    this.store.setLastBlock(block);
  }

  /** Métricas del dashboard (CU-11), con el ratio de ocupación derivado (div/0 → 0, sin NaN). */
  getAggregates(): DashboardAggregates {
    const c = this.store.getCounters();
    return {
      primaryVolumeWei: c.primaryVolumeWei.toString(),
      royaltiesWei: c.royaltiesWei.toString(),
      secondaryVolumeWei: c.secondaryVolumeWei.toString(),
      soldCount: c.soldCount,
      mintedCount: c.mintedCount,
      burnedCount: c.burnedCount,
      occupancyRatioPercent: occupancyRatioPercent(c.soldCount, c.mintedCount),
      lastBlock: c.lastBlock,
    };
  }

  /** Histórico público (CU-09) con orden total descendente (bloque, luego logIndex). */
  getHistory(): SaleHistoryEntry[] {
    return this.store
      .getHistory()
      .map(toHistoryEntry)
      .sort(compareHistoryDesc);
  }
}

/** Traduce la fila persistida (importes en `bigint`) al contrato público (importes en `string`). */
function toHistoryEntry(row: HistoryRow): SaleHistoryEntry {
  return {
    tokenId: row.tokenId.toString(),
    room: row.room,
    dateYYYYMMDD: row.dateYYYYMMDD,
    roomType: row.roomType as NightType,
    priceWei: row.priceWei.toString(),
    saleType: toSaleType(row.saleTypeRaw),
    seller: row.seller,
    buyer: row.buyer,
    blockNumber: row.blockNumber,
    logIndex: row.logIndex,
    txHash: row.txHash,
  };
}

/** Traduce el `uint8` on-chain (`enum SaleType`) a la unión de dominio. */
const toSaleType = (raw: number): SaleType => (raw === 0 ? "PRIMARY" : "SECONDARY");

const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);
