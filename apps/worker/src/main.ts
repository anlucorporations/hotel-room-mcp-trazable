import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { anvilChain, besuChain } from "@hotel/shared";
import { tryReadDeployment } from "@hotel/shared/deployments";
import { loadWorkerConfig } from "./config";
import { createWorkerHealthState, workerHealthProvider } from "./health";
import { createLogger } from "./logger";
import { SqliteCheckpointStore } from "./checkpoint-store";
import { SqliteAggregateStore } from "./aggregate-store";
import { AggregateProcessor } from "./aggregate-processor";
import { ViemChainSource } from "./chain-source";
import { NodemailerMailer } from "./mailer";
import { startWorkerHttpServer } from "./http-server";
import { runWorker } from "./run-worker";

/**
 * Punto de entrada del mini-worker (RF-09, CU-09/10/11).
 *
 * Carga la configuración (fail-fast), crea las implementaciones concretas (SQLite, viem,
 * nodemailer), arranca el `/health` (RNF-17) y lanza `runWorker`. Maneja SIGINT/SIGTERM para
 * un cierre limpio del store.
 */
const CHECKPOINT_DB_PATH = process.env.WORKER_DB_PATH ?? ".data/worker.sqlite";
const AGGREGATE_DB_PATH =
  process.env.WORKER_AGGREGATE_DB_PATH ?? ".data/worker-aggregates.sqlite";

async function main(): Promise<void> {
  const logger = createLogger("worker");
  const config = loadWorkerConfig();

  // Resolución del bloque de despliegue: env explícito > registro de despliegues > 0.
  const deploymentBlock =
    config.DEPLOYMENT_BLOCK ??
    tryReadDeployment(config.CHAIN_ID)?.deploymentBlock ??
    0;

  // Sin DEPLOYMENT_BLOCK ni registro de despliegues, el catch-up arrancaría en el bloque génesis,
  // lo que puede implicar un barrido muy largo y costoso del histórico de la cadena.
  if (deploymentBlock === 0) {
    logger.warn(
      { chainId: config.CHAIN_ID },
      "DEPLOYMENT_BLOCK sin resolver (ni env ni registro): el catch-up arrancará desde el bloque génesis (0)",
    );
  }

  // Cadena viem: Anvil (CHAIN_ID local) o Besu. Ambas comparten CHAIN_ID, así que distinguimos
  // por la URL RPC (localhost ⇒ Anvil dev).
  const chain = isLocalRpc(config.RPC_URL) ? anvilChain : besuChain;

  mkdirSync(dirname(CHECKPOINT_DB_PATH), { recursive: true });
  mkdirSync(dirname(AGGREGATE_DB_PATH), { recursive: true });
  const store = new SqliteCheckpointStore(CHECKPOINT_DB_PATH);
  const aggregateStore = new SqliteAggregateStore(AGGREGATE_DB_PATH);
  const chainSource = new ViemChainSource({
    rpcUrl: config.RPC_URL,
    chain,
    contractAddress: config.CONTRACT_ADDRESS as `0x${string}`,
  });
  const mailer = new NodemailerMailer({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.SMTP_FROM,
    to: config.ADMIN_EMAIL,
  });

  // Lectura de agregados/histórico para los endpoints HTTP: comparte el `aggregateStore` con el
  // procesador que escribe dentro de `runWorker` (misma fuente de verdad SQLite).
  const aggregateReader = new AggregateProcessor({
    chainSource,
    store: aggregateStore,
    deploymentBlock,
  });

  const health = createWorkerHealthState();
  const server = await startWorkerHttpServer({
    host: config.WORKER_HOST,
    port: config.WORKER_PORT,
    provider: workerHealthProvider(health),
    data: {
      getAggregates: () => aggregateReader.getAggregates(),
      getHistory: () => aggregateReader.getHistory(),
    },
    onError: (error: unknown) =>
      logger.error({ error }, "fallo al servir una petición HTTP del worker"),
  });

  // Cierre limpio (MINOR 12): SIGINT/SIGTERM sólo abortan el bucle; los stores se cierran DESPUÉS
  // de que `runWorker` termine el ciclo en curso (abajo), nunca a la vez (evita tocar una BD ya
  // cerrada). El `AbortSignal` se propaga también al sleep del backoff SMTP del `SaleProcessor`.
  const controller = new AbortController();
  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, "cierre del worker en curso · esperando el ciclo actual");
    controller.abort();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  logger.info(
    {
      port: config.WORKER_PORT,
      contract: config.CONTRACT_ADDRESS,
      chainId: config.CHAIN_ID,
      deploymentBlock,
      pollIntervalMs: config.POLL_INTERVAL_MS,
    },
    "worker activo · eventos Sale → email + agregados/histórico (/aggregates, /history)",
  );

  try {
    await runWorker(
      {
        contractAddress: config.CONTRACT_ADDRESS,
        deploymentBlock,
        pollIntervalMs: config.POLL_INTERVAL_MS,
      },
      {
        chainSource,
        mailer,
        store,
        aggregateStore,
        logger,
        health,
        signal: controller.signal,
      },
    );
  } finally {
    // El bucle ya terminó (o falló): ahora sí es seguro cerrar servidor y stores.
    server.close();
    store.close();
    aggregateStore.close();
    logger.info("worker detenido · recursos liberados");
  }
}

/** `true` para RPC locales (Anvil dev). */
const isLocalRpc = (url: string): boolean =>
  url.includes("127.0.0.1") || url.includes("localhost");

void main().catch((error: unknown) => {
  createLogger("worker").error({ error }, "fallo al arrancar el worker");
  process.exitCode = 1;
});
