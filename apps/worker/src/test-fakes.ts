import { pino, type Logger } from "pino";
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
  RoyaltyPaidEvent,
  SaleAggregateEvent,
  SaleEvent,
  SaleNotification,
} from "./types";

/**
 * Fakes para las pruebas del núcleo (T1.4). Permiten ejercitar `SaleProcessor`/`runWorker`
 * sin red ni SMTP reales (DIP). El `CheckpointStore` no se finge: se usa la impl real de
 * SQLite con fichero temporal o `:memory:` para probar persistencia/reinicio.
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

/** ChainSource fake cuya `getHeadBlock` siempre falla (simula caída del RPC). */
export class FailingChainSource implements ChainSource {
  async getHeadBlock(): Promise<bigint> {
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

/**
 * CheckpointStore en memoria para tests. Opcionalmente fuerza un fallo NO-RPC al procesar un
 * evento (`markProcessed` lanza), útil para verificar que un fallo de procesamiento se aísla del
 * conteo de fallos del RPC (MAJOR 2).
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly blocks = new Map<string, number>();
  private readonly processed = new Set<string>();

  constructor(private readonly failOnMarkProcessed = false) {}

  getLastBlock(contractAddress: string): number | null {
    return this.blocks.get(contractAddress.toLowerCase()) ?? null;
  }

  setLastBlock(contractAddress: string, block: number): void {
    this.blocks.set(contractAddress.toLowerCase(), block);
  }

  isProcessed(idempotencyKey: string): boolean {
    return this.processed.has(idempotencyKey);
  }

  markProcessed(idempotencyKey: string): void {
    if (this.failOnMarkProcessed) {
      throw new Error("fallo de procesamiento no-RPC");
    }
    this.processed.add(idempotencyKey);
  }

  close(): void {
    // Sin recursos que liberar.
  }
}

/**
 * AggregateStore en memoria para los tests de `runWorker` (cuando solo interesa que el agregado
 * se alimente). Las pruebas específicas de agregados/histórico usan el store real de SQLite.
 */
export class InMemoryAggregateStore implements AggregateStore {
  private readonly applied = new Set<string>();
  private primaryVolumeWei = 0n;
  private royaltiesWei = 0n;
  private secondaryVolumeWei = 0n;
  private soldCount = 0;
  private mintedCount = 0;
  private burnedCount = 0;
  private lastBlock = 0;
  private readonly history: HistoryRow[] = [];

  applyEvent(event: ChainEvent): boolean {
    const key = idempotencyKey(event);
    if (this.applied.has(key)) return false;
    this.applied.add(key);
    switch (event.kind) {
      case "mint":
        this.mintedCount += 1;
        break;
      case "burn":
        this.burnedCount += 1;
        break;
      case "royaltyPaid":
        this.royaltiesWei += event.amountWei;
        break;
      case "sale":
        this.applySale(event);
        break;
    }
    return true;
  }

  private applySale(event: SaleAggregateEvent): void {
    if (event.saleTypeRaw === 0) {
      this.soldCount += 1;
      this.primaryVolumeWei += event.priceWei;
    } else {
      this.secondaryVolumeWei += event.priceWei;
    }
    this.history.push({
      tokenId: event.tokenId,
      room: Number(event.tokenId / 100_000_000n),
      dateYYYYMMDD: Number(event.tokenId % 100_000_000n),
      roomType: "simple",
      priceWei: event.priceWei,
      saleTypeRaw: event.saleTypeRaw,
      seller: event.seller,
      buyer: event.buyer,
      blockNumber: Number(event.blockNumber),
      logIndex: event.logIndex,
      txHash: event.txHash,
    });
  }

  setLastBlock(block: number): void {
    this.lastBlock = block;
  }

  getCounters(): AggregateCounters {
    return {
      primaryVolumeWei: this.primaryVolumeWei,
      royaltiesWei: this.royaltiesWei,
      secondaryVolumeWei: this.secondaryVolumeWei,
      soldCount: this.soldCount,
      mintedCount: this.mintedCount,
      burnedCount: this.burnedCount,
      lastBlock: this.lastBlock,
    };
  }

  getHistory(): HistoryRow[] {
    return [...this.history];
  }

  close(): void {
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
