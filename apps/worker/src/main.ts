import { startHealthServer } from "@hotel/shared/health";
import { loadWorkerConfig } from "./config";
import { createWorkerHealthState, workerHealthProvider } from "./health";
import { createLogger } from "./logger";

/**
 * Punto de entrada del mini-worker (RF-09, CU-09/10/11).
 *
 * FASE 0: arranca el `/health` (RNF-17) tras validar la configuración (fail-fast). El
 * listener de eventos `Sale`, la idempotencia, el email y los agregados llegan en T1.4/T3.
 */
async function main(): Promise<void> {
  const logger = createLogger("worker");
  const config = loadWorkerConfig();

  const healthState = createWorkerHealthState();
  await startHealthServer({
    host: config.WORKER_HOST,
    port: config.WORKER_PORT,
    provider: workerHealthProvider(healthState),
  });

  logger.info(
    {
      port: config.WORKER_PORT,
      contract: config.CONTRACT_ADDRESS,
      chainId: config.CHAIN_ID,
    },
    "worker /health activo · listener de eventos y email pendientes (T1.4)",
  );
}

void main().catch((error: unknown) => {
  createLogger("worker").error({ error }, "fallo al arrancar el worker");
  process.exitCode = 1;
});
