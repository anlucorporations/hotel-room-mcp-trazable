import type { Logger } from "pino";
import { rebindCheckpoint } from "./rebind";
import { SaleProcessor, type BackoffOptions } from "./sale-processor";
import type { WorkerHealthState } from "./health";
import type { ChainSource, CheckpointStore, Mailer } from "./types";

/**
 * Orquestación del mini-worker (T1.4 / CU-10 / RF-09): rebind del checkpoint si cambió la
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
}

export interface RunWorkerDeps {
  readonly chainSource: ChainSource;
  readonly mailer: Mailer;
  readonly store: CheckpointStore;
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
 * Aplica el rebind del checkpoint ante un posible redeploy (DISEÑO §14).
 *
 * El checkpoint se indexa por dirección: si no hay registro para la dirección actual, se trata
 * como un redeploy (sin estado previo) y el catch-up arrancará en `deploymentBlock` por su
 * rama `checkpoint === null` —no es necesario pre-sembrar la fila, lo cual además saltaría el
 * propio `deploymentBlock`—. Si la dirección coincide con un checkpoint existente, se conserva.
 *
 * Reutiliza la función pura `rebindCheckpoint` (T0.3) para decidir si hubo cambio (y poder
 * registrarlo), manteniendo una única fuente de verdad de la regla de rebind.
 */
function applyRebind(
  store: CheckpointStore,
  contractAddress: string,
  deploymentBlock: number,
  logger: Logger,
): void {
  const last = store.getLastBlock(contractAddress);
  const current = last === null ? null : { contractAddress, lastProcessedBlock: last };
  const { changed } = rebindCheckpoint(current, {
    address: contractAddress,
    deploymentBlock,
  });
  if (changed) {
    logger.info(
      { contractAddress: contractAddress.toLowerCase(), deploymentBlock },
      "redeploy detectado · el catch-up arrancará en el bloque de despliegue",
    );
  }
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
  const { chainSource, mailer, store, logger, health, signal } = deps;
  const sleep = deps.sleep ?? ((ms: number) => defaultSleep(ms, signal));

  applyRebind(store, config.contractAddress, config.deploymentBlock, logger);

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
  });

  while (!signal.aborted) {
    await runCycle(processor, deps);
    if (signal.aborted) break;
    await sleep(config.pollIntervalMs);
  }
}

/**
 * Un ciclo de procesamiento: lee la cabecera, procesa el catch-up hasta ella y actualiza la
 * salud. El bucle continúa siempre (resiliencia: la red/SMTP pueden recuperarse).
 *
 * Sólo los fallos del RPC (`getHeadBlock`/`getSaleLogs`) llegan a este `catch` y se contabilizan
 * para la transición a `down` por RPC (MAJOR 2). El fallo al procesar un evento concreto NO
 * llega aquí: `SaleProcessor.catchUp` lo aísla (lo registra y degrada la salud por "processing"),
 * de modo que un único evento defectuoso no se clasifica como fallo de RPC ni atasca el avance
 * del checkpoint (head-of-line blocking).
 */
export async function runCycle(
  processor: SaleProcessor,
  deps: Pick<RunWorkerDeps, "chainSource" | "logger" | "health">,
): Promise<void> {
  const { chainSource, logger, health } = deps;
  try {
    const head = await chainSource.getHeadBlock();
    const processedUpTo = await processor.catchUp(head);
    health.recordCycle(Number(processedUpTo), Number(head));
  } catch (error: unknown) {
    health.recordRpcFailure();
    logger.error({ error }, "fallo de RPC en el ciclo del worker (cabecera/logs)");
  }
}
