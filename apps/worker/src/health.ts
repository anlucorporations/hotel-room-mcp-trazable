import { HEALTH_FAILURE_THRESHOLD } from "@hotel/shared";
import type { HealthProvider, HealthReport } from "@hotel/shared/health";

/**
 * Estado de salud del worker (RNF-17). El lag se define como `headBlock - lastBlock`.
 *
 * El worker se marca `down` cuando:
 *   - el RPC falla `HEALTH_FAILURE_THRESHOLD` veces consecutivas, o
 *   - el lag de procesamiento (email) supera `lagThreshold` (bloques), o
 *   - la entrega de email queda degradada (`EMAIL_DELIVERY_FAILED`), o
 *   - el procesamiento de un evento falla por una causa no-RPC (`PROCESSING_FAILED`), o
 *   - el `catchUp` de agregados falla `aggregateFailureThreshold` veces consecutivas (MAJOR 4), o
 *   - el lag de agregados (`headBlock - aggregateLastBlock`) supera `lagThreshold` (MAJOR 4).
 *
 * Importante: los fallos del RPC (cabecera/logs) y los fallos al procesar un evento concreto
 * son señales distintas (ver MAJOR 2): un fallo de procesamiento NO incrementa el contador de
 * fallos del RPC ni atasca el checkpoint; sólo degrada la salud por "processing" hasta que un
 * ciclo posterior procese eventos sin error.
 *
 * Pipeline de agregados (MAJOR 4): el `catchUp` de agregados puede fallar por I/O de SQLite sin
 * que sea un fallo de RPC. Antes quedaba invisible en `/health`. Ahora se observa de dos formas:
 * por fallos consecutivos del propio `catchUp` y por el lag de agregados (head − aggregateLastBlock).
 *
 * El estado lo actualiza el bucle de `runWorker` y el `SaleProcessor`; este módulo sólo lo
 * traduce a un `HealthReport` (SRP/DIP: la decisión de "salud" vive aquí, el endpoint en
 * `@hotel/shared/health`).
 */
export const DEFAULT_LAG_THRESHOLD = 50 as const;
export const DEFAULT_AGGREGATE_FAILURE_THRESHOLD = 3 as const;

export interface WorkerHealthOptions {
  /** Lag máximo tolerado (bloques) antes de marcar `down` (aplica a email y agregados). */
  readonly lagThreshold?: number;
  /** Fallos consecutivos del RPC antes de marcar `down`. */
  readonly rpcFailureThreshold?: number;
  /** Fallos consecutivos del `catchUp` de agregados antes de marcar `down` (MAJOR 4). */
  readonly aggregateFailureThreshold?: number;
}

export class WorkerHealthState {
  lastBlock: number | null = null;
  headBlock: number | null = null;
  /** Último bloque agregado (pipeline de agregados/histórico), `null` hasta el primer ciclo. */
  aggregateLastBlock: number | null = null;

  private consecutiveRpcFailures = 0;
  private consecutiveAggregateFailures = 0;
  private emailDegraded = false;
  private processingDegraded = false;
  private readonly lagThreshold: number;
  private readonly rpcFailureThreshold: number;
  private readonly aggregateFailureThreshold: number;

  constructor(options: WorkerHealthOptions = {}) {
    this.lagThreshold = options.lagThreshold ?? DEFAULT_LAG_THRESHOLD;
    this.rpcFailureThreshold =
      options.rpcFailureThreshold ?? HEALTH_FAILURE_THRESHOLD;
    this.aggregateFailureThreshold =
      options.aggregateFailureThreshold ?? DEFAULT_AGGREGATE_FAILURE_THRESHOLD;
  }

  /** Registra un ciclo de polling correcto: actualiza bloques y resetea fallos del RPC. */
  recordCycle(lastBlock: number, headBlock: number): void {
    this.lastBlock = lastBlock;
    this.headBlock = headBlock;
    this.consecutiveRpcFailures = 0;
  }

  /** Registra un fallo del RPC (no pudo leerse la cabecera o los logs). */
  recordRpcFailure(): void {
    this.consecutiveRpcFailures += 1;
  }

  /**
   * Registra un ciclo correcto del pipeline de agregados (MAJOR 4): actualiza el último bloque
   * agregado y resetea los fallos consecutivos de agregados.
   */
  recordAggregateCycle(aggregateLastBlock: number): void {
    this.aggregateLastBlock = aggregateLastBlock;
    this.consecutiveAggregateFailures = 0;
  }

  /** Registra un fallo del `catchUp` de agregados (p. ej. I/O de SQLite), MAJOR 4. */
  recordAggregateFailure(): void {
    this.consecutiveAggregateFailures += 1;
  }

  /** Marca la entrega de email como degradada (tras agotar reintentos SMTP). */
  markEmailDegraded(): void {
    this.emailDegraded = true;
  }

  /** Restablece la entrega de email tras un envío correcto (rearma la salud). */
  clearEmailDegraded(): void {
    this.emailDegraded = false;
  }

  /**
   * Marca el procesamiento como degradado tras un fallo NO-RPC al procesar un evento concreto
   * (p. ej. datos del evento inesperados). No incrementa los fallos del RPC.
   */
  markProcessingDegraded(): void {
    this.processingDegraded = true;
  }

  /** Restablece el procesamiento degradado tras un ciclo que procesó eventos sin error. */
  clearProcessingDegraded(): void {
    this.processingDegraded = false;
  }

  /** Lag del pipeline de email: `headBlock - lastBlock` (bloques pendientes de avisar). */
  get lag(): number | null {
    return this.headBlock !== null && this.lastBlock !== null
      ? this.headBlock - this.lastBlock
      : null;
  }

  /** Lag del pipeline de agregados: `headBlock - aggregateLastBlock` (MAJOR 4). */
  get aggregateLag(): number | null {
    return this.headBlock !== null && this.aggregateLastBlock !== null
      ? this.headBlock - this.aggregateLastBlock
      : null;
  }

  private isDown(): boolean {
    if (this.consecutiveRpcFailures >= this.rpcFailureThreshold) return true;
    if (this.consecutiveAggregateFailures >= this.aggregateFailureThreshold)
      return true;
    if (this.emailDegraded) return true;
    if (this.processingDegraded) return true;
    if (overThreshold(this.lag, this.lagThreshold)) return true;
    return overThreshold(this.aggregateLag, this.lagThreshold);
  }

  toReport(): HealthReport {
    return {
      status: this.isDown() ? "down" : "ok",
      component: "worker",
      details: {
        lastBlock: this.lastBlock,
        headBlock: this.headBlock,
        lag: this.lag,
        aggregateLastBlock: this.aggregateLastBlock,
        aggregateLag: this.aggregateLag,
        consecutiveRpcFailures: this.consecutiveRpcFailures,
        consecutiveAggregateFailures: this.consecutiveAggregateFailures,
        emailDegraded: this.emailDegraded,
        processingDegraded: this.processingDegraded,
      },
    };
  }
}

/** `true` si `value` no es `null` y supera el umbral dado (lag por encima de tolerancia). */
const overThreshold = (value: number | null, threshold: number): boolean =>
  value !== null && value > threshold;

export function createWorkerHealthState(
  options: WorkerHealthOptions = {},
): WorkerHealthState {
  return new WorkerHealthState(options);
}

export function workerHealthProvider(state: WorkerHealthState): HealthProvider {
  return (): HealthReport => state.toReport();
}
