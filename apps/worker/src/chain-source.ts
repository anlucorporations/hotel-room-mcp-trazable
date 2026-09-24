import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { roomTypeOf } from "@hotel/shared";
import type { ChainEvent, ChainSource, SaleEvent } from "./types";

/**
 * Implementación de {@link ChainSource} sobre viem (T1.4 + FASE 3).
 *
 * Lee la cabecera de la cadena y los eventos del contrato mediante `getContractEvents`, que
 * decodifica los argumentos a partir del ABI tipado (`hotelNightsAbi`). El cliente recibe el
 * `Chain` (anvil/besu) y la URL RPC por construcción (DIP: la elección de red la hace
 * `main.ts`, no este módulo).
 *
 * - `getSaleLogs`: solo eventos `Sale`, para el aviso por email (CU-10, docs/SRS.md §9).
 * - `getDomainLogs`: `Mint`/`Sale`/`RoyaltyPaid`/`Burn`, para agregados/histórico (CU-09/11).
 */
export interface ViemChainSourceOptions {
  readonly rpcUrl: string;
  readonly chain: Chain;
  readonly contractAddress: `0x${string}`;
}

/** Log on-chain con localización ya garantizada (no pendiente: tiene tx/logIndex/bloque). */
type LocatedLog = {
  readonly transactionHash: `0x${string}`;
  readonly logIndex: number;
  readonly blockNumber: bigint;
};

/**
 * Concurrencia máxima de lecturas `getBlock` en vuelo para resolver marcas temporales.
 * Acotada para no saturar el RPC cuando un chunk trae eventos en muchos bloques distintos.
 */
const BLOCK_READ_CONCURRENCY = 6;

/**
 * Tamaño máximo de la caché de marcas temporales. Un bloque es inmutable, así que cachear es
 * seguro; el tope evita que el proceso crezca sin límite durante un catch-up largo.
 */
const BLOCK_TIMESTAMP_CACHE_MAX = 2048;

/**
 * Limitador de concurrencia mínimo (estilo p-limit), sin dependencias externas: aplica `task` a
 * cada elemento conservando el orden con, como mucho, `limit` tareas en paralelo.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const isLocated = <T extends {
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  blockNumber: bigint | null;
}>(
  log: T,
): log is T & LocatedLog =>
  log.transactionHash !== null &&
  log.logIndex !== null &&
  log.blockNumber !== null;

export class ViemChainSource implements ChainSource {
  private readonly client: PublicClient;
  private readonly contractAddress: `0x${string}`;
  /**
   * Marcas temporales por número de bloque (segundos UNIX). Un bloque es inmutable, así que la
   * caché es correcta por construcción; se acota para que un catch-up largo no la haga crecer.
   */
  private readonly blockTimestamps = new Map<string, number>();

  constructor(options: ViemChainSourceOptions) {
    this.client = createPublicClient({
      chain: options.chain,
      transport: http(options.rpcUrl),
    });
    this.contractAddress = options.contractAddress;
  }

  async getHeadBlock(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  /**
   * Marca temporal de un bloque (segundos UNIX), con la misma caché que usa `getDomainLogs`.
   * Se usa para rellenar la fecha de las ventas del histórico anteriores a M7 (H6).
   */
  async getBlockTimestamp(blockNumber: bigint): Promise<number> {
    const key = blockNumber.toString();
    const cached = this.blockTimestamps.get(key);
    if (cached !== undefined) return cached;

    const header = await this.client.getBlock({ blockNumber });
    const timestamp = Number(header.timestamp);
    this.rememberBlock(key, timestamp);
    return timestamp;
  }

  async getSaleLogs(fromBlock: bigint, toBlock: bigint): Promise<SaleEvent[]> {
    const logs = await this.client.getContractEvents({
      address: this.contractAddress,
      abi: hotelNightsAbi,
      eventName: "Sale",
      fromBlock,
      toBlock,
      strict: true,
    });

    return logs.filter(isLocated).map((log) => ({
      tokenId: log.args.tokenId,
      seller: log.args.seller,
      buyer: log.args.buyer,
      priceWei: log.args.price,
      saleTypeRaw: log.args.saleType,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
    }));
  }

  async getDomainLogs(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ChainEvent[]> {
    const range = { fromBlock, toBlock, strict: true } as const;
    const base = { address: this.contractAddress, abi: hotelNightsAbi } as const;
    const [mints, sales, royalties, burns] = await Promise.all([
      this.client.getContractEvents({ ...base, eventName: "Mint", ...range }),
      this.client.getContractEvents({ ...base, eventName: "Sale", ...range }),
      this.client.getContractEvents({ ...base, eventName: "RoyaltyPaid", ...range }),
      this.client.getContractEvents({ ...base, eventName: "Burn", ...range }),
    ]);

    const events: ChainEvent[] = [
      ...mints.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "mint",
          tokenId: log.args.tokenId,
          room: Number(log.args.room),
          dateYYYYMMDD: Number(log.args.dateYYYYMMDD),
          // Si el evento omitiera roomType, derivamos del room (defensa en profundidad).
          roomType: log.args.roomType || roomTypeOf(Number(log.args.room)) || "desconocido",
          priceWei: log.args.price,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...sales.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "sale",
          tokenId: log.args.tokenId,
          seller: log.args.seller,
          buyer: log.args.buyer,
          priceWei: log.args.price,
          saleTypeRaw: log.args.saleType,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...royalties.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "royaltyPaid",
          tokenId: log.args.tokenId,
          receiver: log.args.receiver,
          amountWei: log.args.amount,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
      ...burns.filter(isLocated).map(
        (log): ChainEvent => ({
          kind: "burn",
          tokenId: log.args.tokenId,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: log.blockNumber,
        }),
      ),
    ];

    // Orden total determinista: por bloque asc y, en empate, por logIndex asc.
    const ordered = events.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(a.blockNumber - b.blockNumber)
        : a.logIndex - b.logIndex,
    );

    return this.withBlockTimestamps(ordered);
  }

  /**
   * Adjunta a cada evento la marca temporal de su bloque (la necesita la serie mensual de D-16).
   *
   * Se leen **solo los bloques que contienen eventos** (y una única vez por bloque, con caché), no
   * el rango entero: un chunk de 5.000 bloques con dos ventas cuesta dos `getBlock`.
   *
   * Fail-closed a propósito: si la lectura de un bloque falla, el chunk **no se da por agregado**
   * (`catchUp` propaga y no avanza `last_block`), así que se reintenta en el ciclo siguiente. La
   * alternativa —persistir la venta sin fecha— la dejaría fuera de la serie mensual para siempre,
   * porque la idempotencia por `txHash:logIndex` impide volver a procesarla.
   */
  private async withBlockTimestamps(events: readonly ChainEvent[]): Promise<ChainEvent[]> {
    const missing = [
      ...new Set(
        events
          .filter((event) => !this.blockTimestamps.has(event.blockNumber.toString()))
          .map((event) => event.blockNumber.toString()),
      ),
    ];

    if (missing.length > 0) {
      const fetched = await mapWithConcurrency(missing, BLOCK_READ_CONCURRENCY, async (block) => {
        const header = await this.client.getBlock({ blockNumber: BigInt(block) });
        return { block, timestamp: Number(header.timestamp) };
      });
      for (const { block, timestamp } of fetched) {
        this.rememberBlock(block, timestamp);
      }
    }

    return events.map((event) => ({
      ...event,
      blockTimestamp: this.blockTimestamps.get(event.blockNumber.toString()),
    }));
  }

  /** Guarda la marca temporal de un bloque en la caché acotada (FIFO). */
  private rememberBlock(block: string, timestamp: number): void {
    if (this.blockTimestamps.size >= BLOCK_TIMESTAMP_CACHE_MAX) {
      // Desaloja la entrada más antigua: los bloques recientes son los que se repiten.
      const oldest = this.blockTimestamps.keys().next().value;
      if (oldest !== undefined) this.blockTimestamps.delete(oldest);
    }
    this.blockTimestamps.set(block, timestamp);
  }
}
