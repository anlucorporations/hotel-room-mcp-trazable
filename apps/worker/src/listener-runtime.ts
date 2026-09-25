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
}

export interface ListenerRuntime {
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
  } = deps;

  let nextBlock = BigInt(fromBlock);
  let ticking = false;
  let lastHeartbeat = Date.now();

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

  const timer = setInterval(() => {
    if (signal.aborted) return;
    void tick();
  }, pollIntervalMs);
  timer.unref?.();

  logger.info(
    { pollIntervalMs, heartbeatIntervalMs, fromBlock },
    "listener de eventos activo (heartbeat + alerta de silencio + índice off-chain)",
  );

  return {
    tick,
    stop: () => clearInterval(timer),
  };
}
