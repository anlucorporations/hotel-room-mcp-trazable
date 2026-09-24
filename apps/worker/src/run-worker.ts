import type { Logger } from "pino";
import { isCheckpointAheadOfChain, rebindCheckpoint } from "./rebind";
import { SaleProcessor, type BackoffOptions } from "./sale-processor";
import { AggregateProcessor } from "./aggregate-processor";
import type { WorkerHealthState } from "./health";
import type {
  AggregateStore,
  ChainSource,
  CheckpointStore,
  Mailer,
} from "./types";

/**
 * Orquestación del mini-worker (T1.4 / CU-10 / RF-09, docs/SRS.md §9): rebind del checkpoint si cambió la
 * dirección del contrato, catch-up histórico y bucle de polling.
 *
 * `runWorker` recibe sus colaboradores por parámetro (DIP): es ejecutable en tests con fakes,
 * con un `signal` para abortar el bucle de forma determinista.
 */
export interface RunWorkerConfig {
  readonly contractAddress: string;
  readonly deploymentBlock: number;
  readonly pollIntervalMs: number;
  readonly backoff?: BackoffOptions;
  /**
   * Tiempo máximo (ms) que el cierre espera al ciclo en curso antes de retornar (MINOR 12). Acota
   * el shutdown si el ciclo se queda atascado (p. ej. una llamada RPC colgada). Por defecto 10 s.
   */
  readonly shutdownTimeoutMs?: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export interface RunWorkerDeps {
  readonly chainSource: ChainSource;
  readonly mailer: Mailer;
  readonly store: CheckpointStore;
  /** Store de agregados/histórico (FASE 3, CU-09/11). */
  readonly aggregateStore: AggregateStore;
  readonly logger: Logger;
  readonly health: WorkerHealthState;
  /** Señal de parada para un cierre limpio del bucle (SIGINT/SIGTERM). */
  readonly signal: AbortSignal;
  /** Espera inyectable (los tests la sustituyen para no dormir de verdad). */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Aplica el rebind del checkpoint ante un posible redeploy (ADR-09) y mantiene coherente el
 * agregado/histórico (MAJOR 3).
 *
 * Checkpoint del email: se indexa por dirección. Si no hay registro para la dirección actual, se
 * trata como un redeploy (sin estado previo) y el catch-up arrancará en `deploymentBlock` por su
 * rama `checkpoint === null` —no es necesario pre-sembrar la fila, lo cual además saltaría el
 * propio `deploymentBlock`—. Si la dirección coincide con un checkpoint existente, se conserva.
 *
 * Agregados/histórico (MAJOR 3): el `AggregateStore` no se indexa por dirección, sino que persiste
 * la dirección a la que está vinculado (`getBoundAddress`). Si esa dirección difiere de la actual
 * (redeploy con contrato nuevo), se RESETEA el agregado (`reset(deploymentBlock)`: contadores a la
 * base id = 0, `sale_history`/`aggregate_applied` vacías, `last_block = deploymentBlock`) para no
 * arrastrar datos del contrato anterior. La primera vez (sin vínculo previo) solo se registra la
 * dirección, sin resetear (no hay estado previo que limpiar).
 *
 * Reutiliza la función pura `rebindCheckpoint` (T0.3) para decidir si hubo cambio en el checkpoint
 * del email, manteniendo una única fuente de verdad de la regla de rebind.
 */
async function applyRebind(
  store: CheckpointStore,
  aggregateStore: AggregateStore,
  contractAddress: string,
  deploymentBlock: number,
  logger: Logger,
  headBlock: bigint | null,
): Promise<void> {
  const last = await store.getLastBlock(contractAddress);
  const current = last === null ? null : { contractAddress, lastProcessedBlock: last };
  const { changed } = rebindCheckpoint(current, {
    address: contractAddress,
    deploymentBlock,
  });
  if (changed) {
    logger.info(
      { contractAddress: contractAddress.toLowerCase(), deploymentBlock },
      "redeploy detectado · el catch-up de email arrancará en el bloque de despliegue",
    );
  }

  // Antes de tocar los agregados: si la cadena quedó por detrás del checkpoint, rebobinar.
  if (headBlock !== null) {
    await rewindIfChainRestarted(
      store,
      aggregateStore,
      contractAddress,
      deploymentBlock,
      headBlock,
      logger,
    );
  }

  await rebindAggregates(aggregateStore, contractAddress, deploymentBlock, logger);
}

/**
 * Rebobina el checkpoint (email) y los agregados/histórico cuando la cadena quedó **por detrás**
 * de lo ya procesado: reiniciar Anvil conserva la dirección determinista del contrato, así que el
 * reinicio de la cadena no se detecta como redeploy y el checkpoint de la cadena anterior dejaría
 * al worker mudo para siempre (`lag` negativo, contadores congelados).
 *
 * Se rebobina al `deploymentBlock` —la misma convención que el rebind por redeploy— y el catch-up
 * reprocesa la cadena nueva; la idempotencia (`worker_processed_logs`, claves `txHash:logIndex`)
 * garantiza que nada se cuente dos veces. Los agregados se resetean porque describen una cadena
 * que ya no existe.
 */
async function rewindIfChainRestarted(
  store: CheckpointStore,
  aggregateStore: AggregateStore,
  contractAddress: string,
  deploymentBlock: number,
  headBlock: bigint,
  logger: Logger,
): Promise<void> {
  const last = await store.getLastBlock(contractAddress);
  if (last !== null && isCheckpointAheadOfChain(last, headBlock)) {
    await store.setLastBlock(contractAddress, deploymentBlock);
    logger.warn(
      {
        contractAddress: contractAddress.toLowerCase(),
        checkpointLastBlock: last,
        headBlock: Number(headBlock),
        deploymentBlock,
      },
      "cadena reiniciada por detrás del checkpoint · checkpoint de email rebobinado al bloque de despliegue",
    );
  }

  const counters = await aggregateStore.getCounters();
  if (counters.lastBlock > 0 && isCheckpointAheadOfChain(counters.lastBlock, headBlock)) {
    await aggregateStore.reset(deploymentBlock);
    logger.warn(
      {
        contractAddress: contractAddress.toLowerCase(),
        aggregateLastBlock: counters.lastBlock,
        headBlock: Number(headBlock),
        deploymentBlock,
      },
      "cadena reiniciada por detrás del checkpoint · agregados/histórico reseteados al bloque de despliegue",
    );
  }
}

/**
 * Rebind consciente del agregado/histórico (MAJOR 3). Compara la dirección vinculada persistida
 * con la actual; si cambió, resetea el agregado y revincula. Si nunca se había vinculado, solo
 * registra la dirección (no hay estado anterior que limpiar).
 */
async function rebindAggregates(
  aggregateStore: AggregateStore,
  contractAddress: string,
  deploymentBlock: number,
  logger: Logger,
): Promise<void> {
  const bound = await aggregateStore.getBoundAddress();
  const current = contractAddress.toLowerCase();
  if (bound === current) {
    return;
  }
  if (bound !== null) {
    await aggregateStore.reset(deploymentBlock);
    logger.info(
      { previous: bound, contractAddress: current, deploymentBlock },
      "redeploy detectado · agregados/histórico reseteados (MAJOR 3)",
    );
  }
  await aggregateStore.setBoundAddress(current);
}

/**
 * Arranca el worker: rebind → catch-up → bucle de polling cada `pollIntervalMs`. El bucle
 * actualiza el estado de `/health` (lastBlock, headBlock, lag) en cada ciclo y marca `down`
 * cuando el RPC falla repetidamente (la lógica de umbral vive en `WorkerHealthState`).
 *
 * Las señales de salud de email y de procesamiento llegan al estado de `/health` por callbacks
 * inyectados en el `SaleProcessor` (DIP): el procesador no depende de `WorkerHealthState`.
 */
export async function runWorker(
  config: RunWorkerConfig,
  deps: RunWorkerDeps,
): Promise<void> {
  const { chainSource, mailer, store, aggregateStore, logger, health, signal } =
    deps;
  const sleep = deps.sleep ?? ((ms: number) => defaultSleep(ms, signal));

  // La cabeza se lee ANTES del rebind (best-effort): si el RPC no responde, el chequeo de
  // reinicio de cadena se omite y el bucle de polling lo reintentará en el primer ciclo.
  const headBlock = await chainSource.getHeadBlock().catch(() => null);

  await applyRebind(
    store,
    aggregateStore,
    config.contractAddress,
    config.deploymentBlock,
    logger,
    headBlock,
  );

  const processor = new SaleProcessor({
    chainSource,
    mailer,
    store,
    logger,
    contractAddress: config.contractAddress,
    deploymentBlock: config.deploymentBlock,
    backoff: config.backoff,
    // Puerto de salud por callbacks (DIP): el procesador no conoce `WorkerHealthState`.
    health: {
      onEmailDegraded: () => health.markEmailDegraded(),
      onEmailRecovered: () => health.clearEmailDegraded(),
      onProcessingError: () => health.markProcessingDegraded(),
      onProcessingRecovered: () => health.clearProcessingDegraded(),
    },
    sleep: deps.sleep,
    // Cierre limpio (MINOR 12): aborta el backoff SMTP en curso al recibir SIGINT/SIGTERM.
    signal,
  });

  // Agregados/histórico (FASE 3): se alimenta de los mismos bloques, de forma idempotente.
  const aggregateProcessor = new AggregateProcessor({
    chainSource,
    store: aggregateStore,
    deploymentBlock: config.deploymentBlock,
  });

  const shutdownTimeoutMs =
    config.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  while (!signal.aborted) {
    // El ciclo en curso se ejecuta hasta el final salvo que el cierre lo exceda en tiempo: en ese
    // caso retornamos para no bloquear el shutdown (MINOR 12). El `AbortSignal` ya hace que los
    // sleeps internos (backoff SMTP) resuelvan de inmediato, así que el ciclo suele cerrar solo.
    const cycle = runCycle(processor, aggregateProcessor, deps);
    if (signal.aborted) {
      await raceShutdown(cycle, shutdownTimeoutMs, logger);
      break;
    }
    await cycle;
    if (signal.aborted) break;
    await sleep(config.pollIntervalMs);
  }
}

/**
 * Espera al ciclo en curso durante el cierre, acotado por `timeoutMs` (MINOR 12). Si el ciclo no
 * termina a tiempo, registra el timeout y retorna para no bloquear el shutdown; el ciclo seguirá
 * en segundo plano pero el invariante at-least-once se mantiene (nada se marca sin entregar).
 */
async function raceShutdown(
  cycle: Promise<void>,
  timeoutMs: number,
  logger: Logger,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const result = await Promise.race([cycle.then(() => "done" as const), timeout]);
  if (timer) clearTimeout(timer);
  if (result === "timeout") {
    logger.warn(
      { timeoutMs },
      "el ciclo no terminó dentro del timeout de cierre · se cierra de todos modos",
    );
  }
}

/**
 * Un ciclo de procesamiento: lee la cabecera, procesa el catch-up hasta ella y actualiza la
 * salud. El bucle continúa siempre (resiliencia: la red/SMTP pueden recuperarse).
 *
 * Sólo los fallos del RPC (`getHeadBlock`/`getSaleLogs`) llegan al `catch` del email y se
 * contabilizan para la transición a `down` por RPC (MAJOR 2). El fallo al procesar un evento
 * concreto NO llega aquí: `SaleProcessor.catchUp` lo aísla (lo registra y degrada la salud por
 * "processing"), de modo que un único evento defectuoso no se clasifica como fallo de RPC ni
 * atasca el avance del checkpoint (head-of-line blocking).
 *
 * Salud:
 *   - Email: el lag se reporta con el `lastBlock` PERSISTIDO del `CheckpointStore` (MINOR 13), no
 *     con el retorno de `catchUp`. Así, si un email no se entregó (BLOCKER 1), el checkpoint queda
 *     detrás de `head` y el lag lo refleja de forma honesta tras un crash parcial.
 *   - Agregados (MAJOR 4): se observa el pipeline. Un `catchUp` correcto registra el último bloque
 *     agregado (lag de agregados); un fallo persistente (p. ej. I/O de PostgreSQL) degrada `/health`
 *     tras N fallos consecutivos, en vez de quedar invisible.
 */
export async function runCycle(
  processor: SaleProcessor,
  aggregateProcessor: AggregateProcessor,
  deps: Pick<RunWorkerDeps, "chainSource" | "logger" | "health">,
): Promise<void> {
  const { chainSource, logger, health } = deps;

  let head: bigint;
  try {
    head = await chainSource.getHeadBlock();
  } catch (error: unknown) {
    health.recordRpcFailure();
    logger.error({ error }, "fallo de RPC al leer la cabecera");
    return;
  }

  // Email (CU-10): los fallos de RPC de `getSaleLogs` cuentan como fallo de RPC; el fallo de
  // un evento concreto lo aísla `SaleProcessor.catchUp` (no llega aquí).
  try {
    await processor.catchUp(head);
    // MINOR 13: reportamos el progreso PERSISTIDO (no el retorno de `catchUp`), que es el estado
    // real entregado tras un email no entregado o un crash parcial.
    const persisted = await processor.getPersistedLastBlock();
    health.recordCycle(persisted ?? Number(head), Number(head));
  } catch (error: unknown) {
    health.recordRpcFailure();
    logger.error({ error }, "fallo de RPC procesando ventas (email)");
    return;
  }

  // Agregados/histórico (CU-09/11): aislados del ciclo del email. Un fallo (p. ej. I/O de
  // PostgreSQL) NO se clasifica como fallo de RPC, pero SÍ se observa en `/health` (MAJOR 4):
  // degrada tras N fallos consecutivos y publica el lag de agregados.
  try {
    await aggregateProcessor.catchUp(head);
    // Relleno de fechas del histórico anterior a M7 (H6): sin marca temporal, esas ventas quedan
    // fuera de la serie mensual y el dashboard mostraría menos volumen que su propio KPI. Es
    // best-effort (un bloque irrecuperable se queda sin fecha y se declara), así que no puede
    // tumbar el ciclo.
    const backfill = await aggregateProcessor.backfillTimestamps();
    if (backfill.backfilled > 0 || backfill.remaining > 0) {
      logger.info(
        {
          backfilled: backfill.backfilled,
          remaining: backfill.remaining,
        },
        "marcas temporales de bloque recuperadas para el histórico (serie mensual de D-16)",
      );
    }
    const aggregates = await aggregateProcessor.getAggregates();
    health.recordAggregateCycle(aggregates.lastBlock);
  } catch (error: unknown) {
    health.recordAggregateFailure();
    logger.error({ error }, "fallo al actualizar agregados/histórico (no es fallo de RPC)");
  }
}
