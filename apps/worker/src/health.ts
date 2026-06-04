import { HEALTH_FAILURE_THRESHOLD } from "@hotel/shared";
import type { HealthProvider, HealthReport } from "@hotel/shared/health";

/**
 * Estado de salud del worker (RNF-17). El lag se define como `headBlock - lastBlock`.
 *
 * El worker se marca `down` cuando:
 *   - el RPC falla `HEALTH_FAILURE_THRESHOLD` veces consecutivas, o
 *   - el lag de procesamiento supera `lagThreshold` (bloques), o
 *   - la entrega de email queda degradada (`EMAIL_DELIVERY_FAILED`), o
 *   - el procesamiento de un evento falla por una causa no-RPC (`PROCESSING_FAILED`).
 *
 * Importante: los fallos del RPC (cabecera/logs) y los fallos al procesar un evento concreto
 * son señales distintas (ver MAJOR 2): un fallo de procesamiento NO incrementa el contador de
 * fallos del RPC ni atasca el checkpoint; sólo degrada la salud por "processing" hasta que un
 * ciclo posterior procese eventos sin error.
 *
 * El estado lo actualiza el bucle de `runWorker` y el `SaleProcessor`; este módulo sólo lo
 * traduce a un `HealthReport` (SRP/DIP: la decisión de "salud" vive aquí, el endpoint en
 * `@hotel/shared/health`).
 */
export const DEFAULT_LAG_THRESHOLD = 50 as const;

export interface WorkerHealthOptions {
  /** Lag máximo tolerado (bloques) antes de marcar `down`. */
  readonly lagThreshold?: number;
  /** Fallos consecutivos del RPC antes de marcar `down`. */
  readonly rpcFailureThreshold?: number;
}

export class WorkerHealthState {
  lastBlock: number | null = null;
  headBlock: number | null = null;

  private consecutiveRpcFailures = 0;
  private emailDegraded = false;
  private processingDegraded = false;
  private readonly lagThreshold: number;
  private readonly rpcFailureThreshold: number;

  constructor(options: WorkerHealthOptions = {}) {
    this.lagThreshold = options.lagThreshold ?? DEFAULT_LAG_THRESHOLD;
    this.rpcFailureThreshold =
      options.rpcFailureThreshold ?? HEALTH_FAILURE_THRESHOLD;
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

  get lag(): number | null {
    return this.headBlock !== null && this.lastBlock !== null
      ? this.headBlock - this.lastBlock
      : null;
  }

  private isDown(): boolean {
    if (this.consecutiveRpcFailures >= this.rpcFailureThreshold) return true;
    if (this.emailDegraded) return true;
    if (this.processingDegraded) return true;
    const lag = this.lag;
    return lag !== null && lag > this.lagThreshold;
  }

  toReport(): HealthReport {
    return {
      status: this.isDown() ? "down" : "ok",
      component: "worker",
      details: {
        lastBlock: this.lastBlock,
        headBlock: this.headBlock,
        lag: this.lag,
        consecutiveRpcFailures: this.consecutiveRpcFailures,
        emailDegraded: this.emailDegraded,
        processingDegraded: this.processingDegraded,
      },
    };
  }
}

export function createWorkerHealthState(
  options: WorkerHealthOptions = {},
): WorkerHealthState {
  return new WorkerHealthState(options);
}

export function workerHealthProvider(state: WorkerHealthState): HealthProvider {
  return (): HealthReport => state.toReport();
}
