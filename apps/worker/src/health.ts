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
 *   - el lag de agregados (`headBlock - aggregateLastBlock`) supera `lagThreshold` (MAJOR 4), o
 *   - **el checkpoint está POR DELANTE de la cabeza** (`lag` negativo): la cadena se reinició o
 *     revirtió por detrás de lo procesado y el worker no puede avanzar. Antes este caso reportaba
 *     `ok` —un lag negativo no cruzaba ningún umbral— y el fallo era silencioso: `/aggregates` se
 *     quedaba congelado sin que el monitor alertara.
 *
 * Importante: los fallos del RPC (cabecera/logs) y los fallos al procesar un evento concreto
 * son señales distintas (ver MAJOR 2): un fallo de procesamiento NO incrementa el contador de
 * fallos del RPC ni atasca el checkpoint; sólo degrada la salud por "processing" hasta que un
 * ciclo posterior procese eventos sin error.
 *
 * Pipeline de agregados (MAJOR 4): el `catchUp` de agregados puede fallar por I/O de PostgreSQL sin
 * que sea un fallo de RPC. Antes quedaba invisible en `/health`. Ahora se observa de dos formas:
 * por fallos consecutivos del propio `catchUp` y por el lag de agregados (head − aggregateLastBlock).
 *
 * El estado lo actualiza el bucle de `runWorker` y el `SaleProcessor`; este módulo sólo lo
 * traduce a un `HealthReport` (SRP/DIP: la decisión de "salud" vive aquí, el endpoint en
 * `@hotel/shared/health`).
 */
export const DEFAULT_LAG_THRESHOLD = 50 as const;
export const DEFAULT_AGGREGATE_FAILURE_THRESHOLD = 3 as const;

/**
 * Tolerancia (bloques) para un lag de agregados ligeramente negativo (ADR-34).
 *
 * Desde la unificación, el ingestor de agregados corre en el bucle del listener y lee la cabeza en
 * un instante distinto al de `/health`; con un RPC balanceado entre nodos, el checkpoint puede ir
 * 1–4 bloques «por delante» de la cabeza que ve otra lectura sin que nada esté roto. Sin esta
 * tolerancia, `/health` parpadeaba a `down` y el monitor recibía un 503 espurio. Un
 * reinicio/reorg real (miles de bloques) sigue superando la tolerancia y se reporta `down`.
 */
export const AGGREGATE_AHEAD_TOLERANCE_BLOCKS = 10 as const;

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
  /** Proveedor del estado de la quema (H-04); `null` = planificador no configurado. */
  private burnHealthProvider: (() => BurnHealth) | null = null;
  /** Proveedor del estado del outbox de anclaje (F3); `null` = relayer no configurado. */
  private anchorHealthProvider: (() => AnchorHealth) | null = null;
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

  /** Registra un fallo del `catchUp` de agregados (p. ej. I/O de PostgreSQL), MAJOR 4. */
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
    if (isAheadOfChain(this.lag)) return true;
    // Los agregados se escriben en el bucle del listener: se tolera el desfase de unos bloques
    // entre dos lecturas de cabeza (ADR-34); un reorg/reinicio real sigue marcando `down`.
    if (isAheadOfChain(this.aggregateLag, AGGREGATE_AHEAD_TOLERANCE_BLOCKS)) return true;
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
        // Señal de vida de la quema (H-04). Sin proveedor configurado se reporta `disabled`: es el
        // caso del worker arrancado sin clave de firma, que antes solo dejaba un `logger.warn`.
        burn: this.burnHealthProvider?.() ?? { scheduler: "disabled", lastRun: null },
        // Outbox de anclaje (F3 · RNF-M-13): si el relayer no está configurado se reporta `disabled`
        // con contadores a cero, y el monitor puede alertar de firmas que llevan demasiado tiempo sin
        // anclarse (`oldestSignedAt`) o que acumulan reintentos (`maxRetryCount`).
        anchor: this.anchorHealthProvider?.() ?? {
          scheduler: "disabled",
          lastCycle: null,
          stats: { signed: 0, failed: 0, oldestSignedAt: null, maxRetryCount: 0 },
        },
      },
    };
  }

  /**
   * Registra el proveedor del estado de la quema (lo llama el arranque del worker, que es quien sabe
   * si el planificador pudo arrancar). Se evalúa en cada `toReport()`, así que `lastRun` va al día.
   */
  setBurnHealth(provider: () => BurnHealth): void {
    this.burnHealthProvider = provider;
  }

  /**
   * Registra el proveedor del estado del **outbox de anclaje** (F3). Igual que la quema, el arranque
   * decide si el relayer pudo configurarse; el reporte se evalúa en cada `/health`.
   */
  setAnchorHealth(provider: () => AnchorHealth): void {
    this.anchorHealthProvider = provider;
  }
}

/** `true` si `value` no es `null` y supera el umbral dado (lag por encima de tolerancia). */
const overThreshold = (value: number | null, threshold: number): boolean =>
  value !== null && value > threshold;

/**
 * `true` si el checkpoint va por delante de la cabeza (`lag` negativo) más allá de `tolerance`.
 * Es una **inconsistencia**, no un retraso: la cadena quedó detrás de lo ya procesado
 * (reinicio/reorg) y el pipeline no puede avanzar, así que la salud debe degradarse en vez de
 * reportar `ok` con un lag imposible. La `tolerance` se usa solo en el pipeline de agregados, que
 * corre en un bucle independiente (ver `AGGREGATE_AHEAD_TOLERANCE_BLOCKS`).
 */
const isAheadOfChain = (lag: number | null, tolerance = 0): boolean =>
  lag !== null && lag < -tolerance;

/**
 * Estado de la **quema programada** en `/health` (hallazgo **H-04** de la auditoría V6).
 *
 * El proceso de quema no tenía señal de vida: si el planificador no arrancaba (sin clave) o un día no
 * se ejecutaba, nada lo delataba —el fallo ya ocurrió y se detectó a mano—. Ahora se publica si el
 * planificador está `enabled` o `disabled` y el resumen del último ciclo, para que un monitor externo
 * pueda alertar de «hoy no hubo quema».
 */
export interface BurnHealth {
  readonly scheduler: "enabled" | "disabled";
  readonly lastRun: {
    readonly at: string;
    readonly dayKey: string;
    readonly reason: string;
    readonly burnedTokensCount: number;
  } | null;
}

/**
 * Estado del **outbox de anclaje** en `/health` (F3 · RNF-M-13).
 *
 * Publica dos cosas que el monitor necesita para alertar sin mirar la base de datos:
 *   - `lastCycle`: resumen del último ciclo del outbox (si el worker está anclando de verdad);
 *   - `stats`: contadores de la tabla `on_chain_signatures`, incluidos los dos umbrales del ciclo:
 *     `oldestSignedAt` (firma `SIGNED` más antigua → alerta `PENDING_ALERT_MIN`) y `maxRetryCount`
 *     (→ alerta `RETRY_ALERT_COUNT`).
 */
export interface AnchorHealth {
  readonly scheduler: "enabled" | "disabled";
  readonly lastCycle: {
    readonly at: string;
    readonly claimed: number;
    readonly mined: number;
    readonly failed: number;
  } | null;
  readonly stats: {
    readonly signed: number;
    readonly failed: number;
    readonly oldestSignedAt: string | null;
    readonly maxRetryCount: number;
  };
}

export function createWorkerHealthState(
  options: WorkerHealthOptions = {},
): WorkerHealthState {
  return new WorkerHealthState(options);
}

export function workerHealthProvider(state: WorkerHealthState): HealthProvider {
  return (): HealthReport => state.toReport();
}
