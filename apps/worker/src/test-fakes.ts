import { pino, type Logger } from "pino";
import {
  decodeTokenId,
  roomTypeOf,
  summarizeHistory,
  type HistorySummary,
  type NightType,
} from "@hotel/shared";
import { idempotencyKey } from "./aggregate-store";
import type {
  AggregateCounters,
  AggregateStore,
  ChainEvent,
  ChainSource,
  CheckpointStore,
  HistoryRow,
  Mailer,
  MintEvent,
  ProcessedLogLocation,
  RoyaltyPaidEvent,
  SaleAggregateEvent,
  SaleEvent,
  SaleNotification,
  UndatedSaleRow,
} from "./types";

/**
 * Fakes para las pruebas del núcleo (T1.4). Permiten ejercitar `SaleProcessor`/`runWorker`
 * sin red ni SMTP reales (DIP). Los stores en memoria sustituyen a PostgreSQL: los tests del
 * worker NO necesitan una base de datos (en CI no hay PostgreSQL), y la persistencia real
 * (SQL, transacciones, mocks de `pg`) se cubre en `checkpoint-store.test.ts` y
 * `aggregate-store.test.ts`.
 */

/** ChainSource fake: devuelve logs predefinidos y registra los rangos solicitados. */
export class FakeChainSource implements ChainSource {
  /** Rangos `[from, to]` pedidos a `getSaleLogs`, en orden (para verificar la paginación). */
  readonly requestedRanges: Array<{ from: bigint; to: bigint }> = [];
  /** Rangos `[from, to]` pedidos a `getDomainLogs`, en orden. */
  readonly requestedDomainRanges: Array<{ from: bigint; to: bigint }> = [];

  constructor(
    private head: bigint,
    private readonly logs: readonly SaleEvent[] = [],
    private readonly domainLogs: readonly ChainEvent[] = [],
  ) {}

  setHead(head: bigint): void {
    this.head = head;
  }

  async getHeadBlock(): Promise<bigint> {
    return this.head;
  }

  /** Si se activa, la lectura de cabeceras falla (bloque histórico irrecuperable). */
  failBlockTimestamp = false;

  /**
   * Marca temporal de bloque para el relleno del histórico (H6): determinista, `base + bloque`.
   */
  async getBlockTimestamp(blockNumber: bigint): Promise<number> {
    if (this.failBlockTimestamp) throw new Error("cabecera no disponible (RPC)");
    return 1_700_000_000 + Number(blockNumber);
  }

  async getSaleLogs(fromBlock: bigint, toBlock: bigint): Promise<SaleEvent[]> {
    this.requestedRanges.push({ from: fromBlock, to: toBlock });
    return this.logs.filter(
      (log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock,
    );
  }

  async getDomainLogs(fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
    this.requestedDomainRanges.push({ from: fromBlock, to: toBlock });
    return this.domainLogs
      .filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
      .sort((a, b) =>
        a.blockNumber !== b.blockNumber
          ? Number(a.blockNumber - b.blockNumber)
          : a.logIndex - b.logIndex,
      );
  }
}

/**
 * ChainSource fake en el que el RPC del email funciona (cabecera y `getSaleLogs`) pero
 * `getDomainLogs` (agregados) SIEMPRE falla. Simula un fallo aislado del pipeline de agregados
 * (p. ej. lectura de logs de dominio) para verificar que `/health` lo observa (MAJOR 4) sin
 * contarlo como fallo de RPC del email.
 */
export class AggregateFailingChainSource implements ChainSource {
  constructor(private readonly head: bigint) {}

  async getHeadBlock(): Promise<bigint> {
    return this.head;
  }

  async getBlockTimestamp(): Promise<number> {
    throw new Error("I/O de agregados caído");
  }

  async getSaleLogs(): Promise<SaleEvent[]> {
    return [];
  }

  async getDomainLogs(): Promise<ChainEvent[]> {
    throw new Error("I/O de agregados caído");
  }
}

/** ChainSource fake cuya `getHeadBlock` siempre falla (simula caída del RPC). */
export class FailingChainSource implements ChainSource {
  async getHeadBlock(): Promise<bigint> {
    throw new Error("RPC caído");
  }

  async getBlockTimestamp(): Promise<number> {
    throw new Error("RPC caído");
  }

  async getSaleLogs(): Promise<SaleEvent[]> {
    throw new Error("RPC caído");
  }

  async getDomainLogs(): Promise<ChainEvent[]> {
    throw new Error("RPC caído");
  }
}

/** Mailer fake: acumula las notificaciones enviadas. */
export class FakeMailer implements Mailer {
  readonly sent: SaleNotification[] = [];

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    this.sent.push(notification);
  }
}

/** Mailer fake que falla siempre (simula caída SMTP) y cuenta los intentos. */
export class AlwaysFailingMailer implements Mailer {
  attempts = 0;

  async sendSaleEmail(): Promise<void> {
    this.attempts += 1;
    throw new Error("SMTP caído");
  }
}

/**
 * Mailer fake que falla SIEMPRE el envío de una clave concreta (`failTxHash`) y entrega el resto.
 * Útil para el invariante at-least-once (BLOCKER 1): un email del medio del chunk no se entrega y
 * el checkpoint no debe pasar de él, mientras los anteriores sí se envían (una sola vez).
 *
 * `mendTxHash()` deja de fallar esa clave (simula la recuperación SMTP) para verificar el
 * reintento: en el siguiente ciclo sólo se reenvía el fallido, sin duplicar los previos.
 */
export class SelectiveFailingMailer implements Mailer {
  readonly sent: SaleNotification[] = [];
  private failing: string | null;

  constructor(failTxHash: string) {
    this.failing = failTxHash;
  }

  mendTxHash(): void {
    this.failing = null;
  }

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    if (this.failing !== null && notification.txHash === this.failing) {
      throw new Error("SMTP caído para esta clave");
    }
    this.sent.push(notification);
  }
}

/**
 * Mailer fake que falla las primeras `failFirst` veces y luego entrega. Útil para verificar
 * que el backoff recupera la entrega sin marcar la venta como procesada prematuramente.
 */
export class FlakyMailer implements Mailer {
  attempts = 0;
  readonly sent: SaleNotification[] = [];

  constructor(private readonly failFirst: number) {}

  async sendSaleEmail(notification: SaleNotification): Promise<void> {
    this.attempts += 1;
    if (this.attempts <= this.failFirst) {
      throw new Error("SMTP intermitente");
    }
    this.sent.push(notification);
  }
}

/** Estado persistente simulado del checkpoint/idempotencia (compartible entre stores). */
export interface InMemoryCheckpointState {
  readonly blocks: Map<string, number>;
  readonly processed: Set<string>;
}

export const createCheckpointState = (): InMemoryCheckpointState => ({
  blocks: new Map<string, number>(),
  processed: new Set<string>(),
});

/**
 * CheckpointStore en memoria para tests. Opcionalmente fuerza un fallo NO-RPC al procesar un
 * evento (`markProcessed` lanza), útil para verificar que un fallo de procesamiento se aísla del
 * conteo de fallos del RPC (MAJOR 2).
 *
 * El estado se puede compartir entre instancias (`snapshot()` + constructor) para simular un
 * reinicio del proceso sin base de datos real.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  constructor(
    private readonly failOnMarkProcessed = false,
    private readonly state: InMemoryCheckpointState = createCheckpointState(),
  ) {}

  /** Estado compartido: pásalo a un nuevo store para simular un reinicio. */
  snapshot(): InMemoryCheckpointState {
    return this.state;
  }

  async getLastBlock(contractAddress: string): Promise<number | null> {
    return this.state.blocks.get(contractAddress.toLowerCase()) ?? null;
  }

  async setLastBlock(contractAddress: string, block: number): Promise<void> {
    this.state.blocks.set(contractAddress.toLowerCase(), block);
  }

  async isProcessed(idempotencyKey: string): Promise<boolean> {
    return this.state.processed.has(idempotencyKey);
  }

  async markProcessed(
    idempotencyKey: string,
    _location?: ProcessedLogLocation,
  ): Promise<void> {
    if (this.failOnMarkProcessed) {
      throw new Error("fallo de procesamiento no-RPC");
    }
    this.state.processed.add(idempotencyKey);
  }

  async close(): Promise<void> {
    // Sin recursos que liberar.
  }
}

/** Estado persistente simulado de agregados/histórico (compartible entre stores). */
export interface InMemoryAggregateState {
  applied: Set<string>;
  primaryVolumeWei: bigint;
  royaltiesWei: bigint;
  secondaryVolumeWei: bigint;
  soldCount: number;
  mintedCount: number;
  burnedCount: number;
  lastBlock: number;
  history: HistoryRow[];
  boundAddress: string | null;
}

export const createAggregateState = (): InMemoryAggregateState => ({
  applied: new Set<string>(),
  primaryVolumeWei: 0n,
  royaltiesWei: 0n,
  secondaryVolumeWei: 0n,
  soldCount: 0,
  mintedCount: 0,
  burnedCount: 0,
  lastBlock: 0,
  history: [],
  boundAddress: null,
});

/**
 * AggregateStore en memoria para los tests del núcleo de agregados (misma semántica que el store
 * PostgreSQL: idempotencia por `txHash:logIndex`, primarias suman `soldCount`, royalties sólo de
 * `RoyaltyPaid`, reset ante redeploy). El SQL real y la atomicidad se verifican con mocks de `pg`
 * en `aggregate-store.test.ts`.
 */
export class InMemoryAggregateStore implements AggregateStore {
  /** Nº de veces que se ha llamado a `reset` (para verificar el rebind consciente, MAJOR 3). */
  resetCount = 0;

  constructor(private readonly state: InMemoryAggregateState = createAggregateState()) {}

  /** Estado compartido: pásalo a un nuevo store para simular un reinicio. */
  snapshot(): InMemoryAggregateState {
    return this.state;
  }

  async applyEvent(event: ChainEvent): Promise<boolean> {
    const key = idempotencyKey(event);
    if (this.state.applied.has(key)) return false;
    this.state.applied.add(key);
    switch (event.kind) {
      case "mint":
        this.state.mintedCount += 1;
        break;
      case "burn":
        this.state.burnedCount += 1;
        break;
      case "royaltyPaid":
        // Royalties solo de RoyaltyPaid (ventas secundarias): nunca de ventas primarias.
        this.state.royaltiesWei += event.amountWei;
        break;
      case "sale":
        this.applySale(event);
        break;
    }
    return true;
  }

  private applySale(event: SaleAggregateEvent): void {
    if (event.saleTypeRaw === 0) {
      this.state.soldCount += 1;
      this.state.primaryVolumeWei += event.priceWei;
    } else {
      this.state.secondaryVolumeWei += event.priceWei;
    }
    const { room, dateYYYYMMDD } = decodeTokenId(event.tokenId);
    this.state.history.push({
      tokenId: event.tokenId,
      room,
      dateYYYYMMDD,
      roomType: roomTypeOf(room) ?? "desconocido",
      priceWei: event.priceWei,
      saleTypeRaw: event.saleTypeRaw,
      seller: event.seller,
      buyer: event.buyer,
      blockNumber: Number(event.blockNumber),
      logIndex: event.logIndex,
      txHash: event.txHash,
      blockTimestamp: event.blockTimestamp ?? null,
    });
  }

  async setLastBlock(block: number): Promise<void> {
    this.state.lastBlock = block;
  }

  async getCounters(): Promise<AggregateCounters> {
    return {
      primaryVolumeWei: this.state.primaryVolumeWei,
      royaltiesWei: this.state.royaltiesWei,
      secondaryVolumeWei: this.state.secondaryVolumeWei,
      soldCount: this.state.soldCount,
      mintedCount: this.state.mintedCount,
      burnedCount: this.state.burnedCount,
      lastBlock: this.state.lastBlock,
    };
  }

  async getHistory(): Promise<HistoryRow[]> {
    return [...this.state.history];
  }

  /**
   * Misma semántica que el `GROUP BY` de PostgreSQL, reutilizando la derivación pura del dominio
   * (`summarizeHistory`): así el núcleo se prueba sin base de datos y el SQL del store se verifica
   * aparte con mocks de `pg` y, en el E2E de M7, contra PostgreSQL real.
   */
  async getHistorySummary(timeZone: string, topLimit: number): Promise<HistorySummary> {
    return summarizeHistory(
      this.state.history.map((row) => ({
        tokenId: row.tokenId.toString(),
        room: row.room,
        dateYYYYMMDD: row.dateYYYYMMDD,
        roomType: row.roomType as NightType,
        priceWei: row.priceWei.toString(),
        saleType: row.saleTypeRaw === 0 ? "PRIMARY" : "SECONDARY",
        seller: row.seller,
        buyer: row.buyer,
        blockNumber: row.blockNumber,
        logIndex: row.logIndex,
        txHash: row.txHash,
        blockTimestamp: row.blockTimestamp,
      })),
      timeZone,
      topLimit,
    );
  }

  async getUndatedSales(limit: number): Promise<UndatedSaleRow[]> {
    return this.state.history
      .filter((row) => row.blockTimestamp === null)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .slice(0, limit)
      .map((row) => ({
        txHash: row.txHash,
        logIndex: row.logIndex,
        blockNumber: row.blockNumber,
      }));
  }

  async setSaleBlockTimestamp(
    txHash: string,
    logIndex: number,
    timestampSeconds: number,
  ): Promise<void> {
    const row = this.state.history.find(
      (candidate) => candidate.txHash === txHash && candidate.logIndex === logIndex,
    );
    // Solo rellena si estaba vacía: misma garantía que el `AND block_timestamp IS NULL` del SQL.
    if (row !== undefined && row.blockTimestamp === null) {
      (row as { blockTimestamp: number | null }).blockTimestamp = timestampSeconds;
    }
  }

  async reset(deploymentBlock: number): Promise<void> {
    this.resetCount += 1;
    this.state.applied = new Set<string>();
    this.state.primaryVolumeWei = 0n;
    this.state.royaltiesWei = 0n;
    this.state.secondaryVolumeWei = 0n;
    this.state.soldCount = 0;
    this.state.mintedCount = 0;
    this.state.burnedCount = 0;
    this.state.lastBlock = deploymentBlock;
    this.state.history = [];
  }

  async getBoundAddress(): Promise<string | null> {
    return this.state.boundAddress;
  }

  async setBoundAddress(contractAddress: string): Promise<void> {
    this.state.boundAddress = contractAddress.toLowerCase();
  }

  async close(): Promise<void> {
    // Sin recursos que liberar.
  }
}

/** Logger silencioso para no contaminar la salida de los tests. */
export const silentLogger = (): Logger => pino({ level: "silent" });

/** `sleep` instantáneo para no introducir latencia real en los tests. */
export const noSleep = (): Promise<void> => Promise.resolve();

/** Constructor de eventos `Sale` para los tests, con valores por defecto razonables. */
export function makeSaleEvent(overrides: Partial<SaleEvent> = {}): SaleEvent {
  return {
    tokenId: 10_220_260_615n, // hab 102, 2026-06-15 (simple)
    seller: "0x0000000000000000000000000000000000000001",
    buyer: "0x0000000000000000000000000000000000000002",
    priceWei: 1_000_000_000_000_000_000n, // 1 ETH
    saleTypeRaw: 0,
    txHash: `0x${"ab".repeat(32)}`,
    logIndex: 0,
    blockNumber: 5n,
    ...overrides,
  };
}

const DEFAULT_TX = `0x${"ab".repeat(32)}`;
const ADDR = (n: number): string =>
  `0x${n.toString(16).padStart(40, "0")}`;

/** Constructor de eventos `Mint` para los tests. */
export function makeMintEvent(overrides: Partial<MintEvent> = {}): MintEvent {
  return {
    kind: "mint",
    tokenId: 10_220_260_615n,
    room: 102,
    dateYYYYMMDD: 20_260_615,
    roomType: "simple",
    priceWei: 1_000_000_000_000_000_000n,
    txHash: DEFAULT_TX,
    logIndex: 0,
    blockNumber: 2n,
    ...overrides,
  };
}

/** Constructor de eventos de venta (agregados/histórico) para los tests. */
export function makeSaleAggregateEvent(
  overrides: Partial<SaleAggregateEvent> = {},
): SaleAggregateEvent {
  return {
    kind: "sale",
    tokenId: 10_220_260_615n,
    seller: ADDR(1),
    buyer: ADDR(2),
    priceWei: 1_000_000_000_000_000_000n,
    saleTypeRaw: 0,
    txHash: DEFAULT_TX,
    logIndex: 0,
    blockNumber: 3n,
    ...overrides,
  };
}

/** Constructor de eventos `RoyaltyPaid` para los tests. */
export function makeRoyaltyPaidEvent(
  overrides: Partial<RoyaltyPaidEvent> = {},
): RoyaltyPaidEvent {
  return {
    kind: "royaltyPaid",
    tokenId: 10_220_260_615n,
    receiver: ADDR(9),
    amountWei: 100_000_000_000_000_000n, // 0.1 ETH
    txHash: DEFAULT_TX,
    logIndex: 0,
    blockNumber: 4n,
    ...overrides,
  };
}
