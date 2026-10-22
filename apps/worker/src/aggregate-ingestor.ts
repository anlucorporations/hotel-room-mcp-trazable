import type { CanonicalDomainEvent, CanonicalEventsBatch } from "@hotel/shared";
import type { ChainEvent } from "./types";

/**
 * Consumidor de agregados/histórico del **flujo canónico único** (ADR-34).
 *
 * El listener decodifica cada lote de logs una sola vez y lo publica por `onCanonicalEvents`. Este
 * ingestor lo traduce a los eventos de dominio que entiende el `AggregateStore`, resuelve la marca
 * temporal de los bloques de venta (la necesita la serie mensual, D-16) y lo aplica de forma
 * idempotente. Así el índice `nfts` y los agregados se alimentan de la MISMA pasada: ya no hay un
 * segundo escaneo de la cadena que pueda ir por detrás o por delante del primero.
 *
 * Semántica heredada de `AggregateProcessor.catchUp`:
 *   - **fail-closed con la marca temporal**: si un bloque de venta no se puede leer, el lote NO se
 *     aplica y el error se propaga (la reconciliación reintenta el rango); no se persiste una venta
 *     sin fecha que luego quedaría fuera de la serie mensual.
 *   - **idempotencia**: la garantiza el store por `txHash:logIndex`; un reintento no duplica.
 *   - **avance de `lastBlock`** solo tras aplicar el lote completo.
 *
 * No conoce viem ni `pg`: recibe el escritor y el lector de marcas temporales por construcción (DIP).
 */
export interface AggregateEventWriter {
  apply(events: readonly ChainEvent[]): Promise<number>;
  setLastBlock(block: number): Promise<void>;
}

export interface AggregateEventIngestorDeps {
  /** Escritor de agregados/histórico (en producción, el `AggregateProcessor` sobre PostgreSQL). */
  readonly writer: AggregateEventWriter;
  /** Marca temporal (segundos UNIX) de un bloque; en producción, `ViemChainSource.getBlockTimestamp`. */
  readonly getBlockTimestamp: (blockNumber: bigint) => Promise<number>;
  /** Se llama al aplicar un lote (para `/health`: `recordAggregateCycle`). */
  readonly onApplied?: (lastBlock: number) => void;
  /** Se llama ante un fallo antes de propagarlo (para `/health`: `recordAggregateFailure`). */
  readonly onFailure?: (error: unknown) => void;
}

/** Tipos canónicos que mantienen agregados/histórico (los otros dos solo afectan al índice). */
type AggregatedCanonicalEvent = Extract<
  CanonicalDomainEvent,
  { kind: "mint" | "sale" | "royaltyPaid" | "burn" }
>;

const isAggregated = (
  event: CanonicalDomainEvent,
): event is AggregatedCanonicalEvent =>
  event.kind === "mint" ||
  event.kind === "sale" ||
  event.kind === "royaltyPaid" ||
  event.kind === "burn";

/**
 * Concurrencia máxima de lecturas `getBlock` en vuelo para resolver marcas temporales. Acotada
 * para no saturar el RPC cuando un lote trae ventas en muchos bloques distintos.
 */
const BLOCK_READ_CONCURRENCY = 6;

export class AggregateEventIngestor {
  private readonly writer: AggregateEventWriter;
  private readonly getBlockTimestamp: (blockNumber: bigint) => Promise<number>;
  private readonly onApplied?: (lastBlock: number) => void;
  private readonly onFailure?: (error: unknown) => void;

  constructor(deps: AggregateEventIngestorDeps) {
    this.writer = deps.writer;
    this.getBlockTimestamp = deps.getBlockTimestamp;
    this.onApplied = deps.onApplied;
    this.onFailure = deps.onFailure;
  }

  /**
   * Aplica un lote canónico. Devuelve cuántos eventos se contabilizaron ahora (los duplicados de un
   * reintento los descarta el store). El checkpoint (`lastBlock`) avanza **siempre** hasta
   * `scannedToBlock`, aunque el lote no traiga eventos: así el lag no crece en tramos silenciosos.
   */
  async apply(batch: CanonicalEventsBatch): Promise<number> {
    const relevant = batch.events.filter(isAggregated);

    try {
      let applied = 0;
      if (relevant.length > 0) {
        const timestamps = await this.resolveSaleTimestamps(relevant);
        const events = relevant.map((event) => toChainEvent(event, timestamps));
        applied = await this.writer.apply(events);
      }
      const lastBlock = Number(batch.scannedToBlock);
      await this.writer.setLastBlock(lastBlock);
      this.onApplied?.(lastBlock);
      return applied;
    } catch (error: unknown) {
      this.onFailure?.(error);
      throw error;
    }
  }

  /**
   * Resuelve la marca temporal de cada bloque con ventas. Solo las ventas la usan (histórico
   * mensual), así que se leen únicamente esos bloques y una vez por bloque (caché del `ChainSource`).
   * Fail-closed: si una lectura falla, el lote no se aplica.
   */
  private async resolveSaleTimestamps(
    events: readonly AggregatedCanonicalEvent[],
  ): Promise<ReadonlyMap<bigint, number>> {
    const blocks = [
      ...new Set(
        events
          .filter((event): event is Extract<AggregatedCanonicalEvent, { kind: "sale" }> =>
            event.kind === "sale",
          )
          .map((event) => event.blockNumber),
      ),
    ];
    const timestamps = new Map<bigint, number>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < blocks.length) {
        const block = blocks[next++]!;
        timestamps.set(block, await this.getBlockTimestamp(block));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(BLOCK_READ_CONCURRENCY, blocks.length) }, worker),
    );
    return timestamps;
  }
}

/** Traduce un evento canónico al evento de dominio del store (sin perder la localización). */
function toChainEvent(
  event: AggregatedCanonicalEvent,
  timestamps: ReadonlyMap<bigint, number>,
): ChainEvent {
  switch (event.kind) {
    case "mint":
      return {
        kind: "mint",
        tokenId: event.tokenId,
        room: Number(event.room),
        dateYYYYMMDD: Number(event.dateYYYYMMDD),
        roomType: event.roomType,
        priceWei: event.priceWei,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
      };
    case "sale":
      return {
        kind: "sale",
        tokenId: event.tokenId,
        seller: event.seller,
        buyer: event.buyer,
        priceWei: event.priceWei,
        saleTypeRaw: event.saleTypeRaw,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
        blockTimestamp: timestamps.get(event.blockNumber),
      };
    case "royaltyPaid":
      return {
        kind: "royaltyPaid",
        tokenId: event.tokenId,
        receiver: event.receiver,
        amountWei: event.amountWei,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
      };
    case "burn":
      return {
        kind: "burn",
        tokenId: event.tokenId,
        txHash: event.txHash,
        logIndex: event.logIndex,
        blockNumber: event.blockNumber,
      };
  }
}
