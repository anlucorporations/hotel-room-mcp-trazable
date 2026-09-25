import {
  compareHistoryDesc,
  DASHBOARD_TIME_ZONE,
  GETLOGS_MAX_RANGE,
  occupancyRatioPercent,
  TOP_RESOLD_LIMIT,
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
 * Núcleo de agregados/histórico (FASE 3, T3.1/T3.2, CU-09/11, docs/SRS.md §9, ADR-09).
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
 * No conoce viem ni `pg`: recibe su `AggregateStore` por construcción (DIP), por lo que es
 * testeable con fakes en memoria, sin base de datos.
 */
export interface AggregateProcessorDeps {
  readonly chainSource: ChainSource;
  readonly store: AggregateStore;
  /** Bloque de despliegue: límite inferior del catch-up (ADR-09). */
  readonly deploymentBlock: number;
  /**
   * Zona horaria del hotel para la serie mensual (D-16). Por defecto `Europe/Madrid`: el mes de
   * una venta es el del hotel, no el de UTC.
   */
  readonly timeZone?: string;
  /** Máximo de noches del ranking de más revendidas (por defecto `TOP_RESOLD_LIMIT`). */
  readonly topResoldLimit?: number;
}

export class AggregateProcessor {
  private readonly chainSource: ChainSource;
  private readonly store: AggregateStore;
  private readonly deploymentBlock: number;
  private readonly timeZone: string;
  private readonly topResoldLimit: number;

  constructor(deps: AggregateProcessorDeps) {
    this.chainSource = deps.chainSource;
    this.store = deps.store;
    this.deploymentBlock = deps.deploymentBlock;
    this.timeZone = deps.timeZone ?? DASHBOARD_TIME_ZONE;
    this.topResoldLimit = deps.topResoldLimit ?? TOP_RESOLD_LIMIT;
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
    const counters = await this.store.getCounters();
    // `lastBlock = 0` puede ser "nada agregado aún": arrancamos en el deploymentBlock.
    const resumeFrom =
      counters.lastBlock === 0 ? this.deploymentBlock : counters.lastBlock + 1;
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
      await this.apply(events);
      await this.store.setLastBlock(Number(toBlock));
      fromBlock = toBlock + 1n;
    }

    return headBlock;
  }

  /**
   * Aplica un lote de eventos al store (idempotente). Devuelve cuántos se contabilizaron ahora
   * (primera vez); los duplicados (ya aplicados) se ignoran sin efecto.
   */
  async apply(events: readonly ChainEvent[]): Promise<number> {
    let applied = 0;
    for (const event of events) {
      if (await this.store.applyEvent(event)) {
        applied += 1;
      }
    }
    return applied;
  }

  /** Fija el último bloque agregado (periodo deploymentBlock..lastBlock). */
  setLastBlock(block: number): Promise<void> {
    return this.store.setLastBlock(block);
  }

  /**
   * Métricas del dashboard (CU-11 + D-16), con el ratio de ocupación derivado (div/0 → 0, sin NaN)
   * y los agregados del histórico (serie mensual, desglose por tipo y ranking de más revendidas)
   * calculados en PostgreSQL. Ambas lecturas van en paralelo: son independientes entre sí.
   */
  async getAggregates(): Promise<DashboardAggregates> {
    const [c, summary] = await Promise.all([
      this.store.getCounters(),
      this.store.getHistorySummary(this.timeZone, this.topResoldLimit),
    ]);
    return {
      primaryVolumeWei: c.primaryVolumeWei.toString(),
      royaltiesWei: c.royaltiesWei.toString(),
      secondaryVolumeWei: c.secondaryVolumeWei.toString(),
      soldCount: c.soldCount,
      mintedCount: c.mintedCount,
      burnedCount: c.burnedCount,
      occupancyRatioPercent: occupancyRatioPercent(c.soldCount, c.mintedCount),
      lastBlock: c.lastBlock,
      timeZone: this.timeZone,
      ...summary,
    };
  }

  /** Histórico público (CU-09) con orden total descendente (bloque, luego logIndex). */
  async getHistory(): Promise<SaleHistoryEntry[]> {
    const rows = await this.store.getHistory();
    return rows.map(toHistoryEntry).sort(compareHistoryDesc);
  }

  /**
   * Rellena la marca temporal de las ventas que no la tienen (histórico anterior a la migración de
   * M7), leyendo la cabecera de su bloque (M7 · H6).
   *
   * Por qué importa: sin fecha, esas ventas quedan fuera de la serie mensual y el dashboard muestra
   * un volumen menor que su propio KPI (en la base de desarrollo eran 26 de 36 filas, el 68 % del
   * volumen primario). La fecha de un bloque es un hecho inmutable, así que rellenarla no inventa
   * nada: se RECUPERA.
   *
   * Best-effort deliberado: si la cabecera de un bloque no se puede leer (p. ej. la cadena se
   * reinició y ese bloque ya no existe), la fila se queda sin fecha y se sigue declarando en
   * `undatedSalesCount`; el ciclo del worker no se cae por un dato histórico irrecuperable.
   */
  async backfillTimestamps(limit = 500): Promise<{ backfilled: number; remaining: number }> {
    const undated = await this.store.getUndatedSales(limit);
    if (undated.length === 0) {
      return { backfilled: 0, remaining: 0 };
    }

    const timestampsByBlock = new Map<number, number>();
    let backfilled = 0;
    for (const row of undated) {
      let timestamp = timestampsByBlock.get(row.blockNumber);
      if (timestamp === undefined) {
        try {
          timestamp = await this.chainSource.getBlockTimestamp(BigInt(row.blockNumber));
        } catch {
          continue; // Bloque irrecuperable: la fila sigue sin fecha (y declarada como tal).
        }
        timestampsByBlock.set(row.blockNumber, timestamp);
      }
      await this.store.setSaleBlockTimestamp(row.txHash, row.logIndex, timestamp);
      backfilled += 1;
    }

    return { backfilled, remaining: undated.length - backfilled };
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
    blockTimestamp: row.blockTimestamp,
  };
}

/** Traduce el `uint8` on-chain (`enum SaleType`) a la unión de dominio. */
const toSaleType = (raw: number): SaleType => (raw === 0 ? "PRIMARY" : "SECONDARY");

const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);
