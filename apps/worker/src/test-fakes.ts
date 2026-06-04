import { pino, type Logger } from "pino";
import type {
  ChainSource,
  CheckpointStore,
  Mailer,
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

  constructor(
    private head: bigint,
    private readonly logs: readonly SaleEvent[] = [],
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
}

/** ChainSource fake cuya `getHeadBlock` siempre falla (simula caída del RPC). */
export class FailingChainSource implements ChainSource {
  async getHeadBlock(): Promise<bigint> {
    throw new Error("RPC caído");
  }

  async getSaleLogs(): Promise<SaleEvent[]> {
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
