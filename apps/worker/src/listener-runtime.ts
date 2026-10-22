import type { Logger } from "pino";
import type { PublicClient } from "viem";
import type { EventListenerService } from "@hotel/shared";

/**
 * Runtime del `EventListenerService` (D-12).
 *
 * El servicio existía pero **nadie lo instanciaba**: sin él no había heartbeat, ni alerta de
 * silencio, ni índice off-chain alimentado desde la cadena. Este driver lo conecta al worker:
 *
 *   - cada `pollIntervalMs` lee la cabeza, **reconcilia** los logs del contrato canónico desde el
 *     último bloque procesado y consolida lo que ya tiene confirmaciones suficientes;
 *   - cada `heartbeatIntervalMs` comprueba el silencio: si no llegan bloques en
 *     `silenceThresholdMs`, se encola una alerta a DevOps (vía cola única de correo).
 */
export interface ListenerRuntimeDeps {
  readonly listener: EventListenerService;
  readonly publicClient: PublicClient;
  readonly logger: Logger;
  readonly signal: AbortSignal;
  readonly pollIntervalMs: number;
  readonly heartbeatIntervalMs?: number;
  /** Bloque desde el que empezar a reconciliar (bloque de despliegue la primera vez). */
  readonly fromBlock: number;
  /**
   * Si es `false`, el bucle NO arranca al crear el runtime: hay que llamar a `start()`. El worker
   * lo usa para arrancarlo después del rebind, cuando los agregados ya están alineados al contrato
   * (ADR-34). Por defecto `true` (comportamiento histórico).
   */
  readonly autostart?: boolean;
}

export interface ListenerRuntime {
  /** Arranca el bucle (idempotente). Hace una primera pasada inmediata. */
  start(): void;
  stop(): void;
  /** Una pasada completa (reconciliar + consolidar + comprobar silencio). Devuelve el head leído. */
  tick(): Promise<bigint | null>;
}

export function startListenerRuntime(deps: ListenerRuntimeDeps): ListenerRuntime {
  const {
    listener,
    publicClient,
    logger,
    signal,
    pollIntervalMs,
    heartbeatIntervalMs = 30_000,
    fromBlock,
    autostart = true,
  } = deps;

  let nextBlock = BigInt(fromBlock);
  let ticking = false;
  let lastHeartbeat = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async (): Promise<bigint | null> => {
    if (ticking) return null;
    ticking = true;
    try {
      const head = await publicClient.getBlockNumber();
      if (head >= nextBlock) {
        await listener.reconcileLogsChunked(publicClient, nextBlock, head);
        nextBlock = head + 1n;
      }
      await listener.onNewBlock(head);

      if (Date.now() - lastHeartbeat >= heartbeatIntervalMs) {
        lastHeartbeat = Date.now();
        await listener.checkSilenceAlert();
      }
      return head;
    } catch (error: unknown) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "listener de eventos: fallo en el ciclo (se reintentará)",
      );
      return null;
    } finally {
      ticking = false;
    }
  };

  const start = (): void => {
    if (timer !== null || signal.aborted) return;
    timer = setInterval(() => {
      if (signal.aborted) return;
      void tick();
    }, pollIntervalMs);
    timer.unref?.();

    logger.info(
      { pollIntervalMs, heartbeatIntervalMs, fromBlock },
      "listener de eventos activo (heartbeat + alerta de silencio + índice off-chain + agregados, ADR-34)",
    );

    // Primera pasada inmediata: en el arranque el catch-up no debe esperar un intervalo completo.
    void tick();
  };

  if (autostart) start();

  return {
    start,
    tick,
    stop: () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
