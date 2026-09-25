import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  anvilChain,
  besuChain,
  BurnerService,
  closeDbPool,
  EventListenerService,
  getDbPool,
  NFTsRepository,
  NotificationQueueService,
  runMigrations,
} from "@hotel/shared";
import { tryReadDeployment } from "@hotel/shared/deployments";
import { loadWorkerConfig, type WorkerConfig } from "./config";
import { createWorkerHealthState, workerHealthProvider } from "./health";
import { createLogger } from "./logger";
import { PgCheckpointStore } from "./checkpoint-store";
import { PgAggregateStore } from "./aggregate-store";
import { AggregateProcessor } from "./aggregate-processor";
import { ViemChainSource } from "./chain-source";
import { createSmtpTransporter } from "./mailer";
import { QueuedMailer, SmtpEmailSender } from "./queued-mailer";
import { createPushServiceIfConfigured, SaleMailerWithPush } from "./sale-notifier";
import { reconcileOnce, startEmailConsumer } from "./email-consumer";
import { startWorkerHttpServer } from "./http-server";
import { runWorker } from "./run-worker";
import { startBurnScheduler, type BurnScheduler } from "./burn-scheduler";
import { startRetentionScheduler } from "./retention-scheduler";
import { startListenerRuntime } from "./listener-runtime";

// Node no carga `.env` por si solo (Next.js si lo hace): en desarrollo lo cargamos desde la
// raiz del monorepo. Si el fichero no existe se usan las variables del entorno (CI/contenedor),
// que es el caso de produccion; por eso no es un error.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // Sin fichero .env: no es un error.
}
/**
 * Punto de entrada del mini-worker (RF-09, CU-09/10/11, docs/SRS.md §9).
 *
 * Carga la configuración (fail-fast), aplica el esquema PostgreSQL (D-03/D-09) —el worker
 * persiste TODO su estado en la MISMA base que la web—, crea las implementaciones concretas
 * (PostgreSQL, viem, nodemailer), arranca el `/health` (RNF-17) y lanza `runWorker`. Maneja
 * SIGINT/SIGTERM para un cierre limpio.
 *
 * Arranque fail-closed: si el esquema no se puede aplicar (base inaccesible, credenciales,
 * permisos), el worker NO arranca: registra el motivo y termina con código de salida 1 en vez
 * de quedar a medias.
 */

async function main(): Promise<void> {
  const logger = createLogger("worker");
  const config = loadWorkerConfig();

  const deploymentBlock = resolveDeploymentBlock(config, logger);

  // Cadena viem: Anvil (CHAIN_ID local) o Besu. Ambas comparten CHAIN_ID, así que distinguimos
  // por la URL RPC (localhost ⇒ Anvil dev).
  const chain = isLocalRpc(config.RPC_URL) ? anvilChain : besuChain;

  // Un único pool para todo el proceso (una sola base, D-09). El esquema se aplica ANTES de
  // crear los stores: un worker sobre una base vacía crea las tablas y arranca.
  const pool = getDbPool();
  try {
    await runMigrations(pool);
  } catch (error: unknown) {
    logger.error(
      {
        error,
        errorMessage: describeError(error),
        chainId: config.CHAIN_ID,
      },
      "MIGRATION_FAILED · no se pudo aplicar el esquema PostgreSQL: el worker no arranca (revisa DATABASE_URL, credenciales y permisos)",
    );
    await closeDbPool();
    throw new Error(
      `esquema PostgreSQL no disponible al arrancar el worker (runMigrations falló): ${describeError(error)}`,
    );
  }

  const store = new PgCheckpointStore(pool);
  const aggregateStore = new PgAggregateStore(pool);
  const chainSource = new ViemChainSource({
    rpcUrl: config.RPC_URL,
    chain,
    contractAddress: config.CONTRACT_ADDRESS as `0x${string}`,
  });
  const mailer = new SaleMailerWithPush(
    new QueuedMailer(config.ADMIN_EMAIL, pool),
    createPushServiceIfConfigured(logger),
    logger,
  );
  const notificationQueue = new NotificationQueueService(pool);

  // Lectura de agregados/histórico para los endpoints HTTP: comparte el `aggregateStore` con el
  // procesador que escribe dentro de `runWorker` (misma fuente de verdad PostgreSQL).
  const aggregateReader = new AggregateProcessor({
    chainSource,
    store: aggregateStore,
    deploymentBlock,
  });

  const health = createWorkerHealthState();

  // Consumidor de la cola única de correo (D-03). El pipeline de ventas solo ENCOLA; entregar es
  // responsabilidad de este consumidor, y la salud refleja si el correo sale de verdad.
  const emailConsumer = startEmailConsumer({
    queue: notificationQueue,
    sender: new SmtpEmailSender(
      createSmtpTransporter({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
        from: config.SMTP_FROM,
        to: config.ADMIN_EMAIL,
      }),
      config.SMTP_FROM,
    ),
    logger,
    onDelivered: () => health.clearEmailDegraded(),
    onFailed: () => health.markEmailDegraded(),
    // Un correo que agota los reintentos avisa a DevOps en vez de quedar `FAILED` en silencio (M8).
    devopsEmail: config.DEVOPS_ALERT_EMAIL,
  });

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
  // de que `runWorker` termine el ciclo en curso (abajo), nunca a la vez (evita tocar un pool ya
  // cerrado). El `AbortSignal` se propaga también al sleep del backoff SMTP del `SaleProcessor`.
  const controller = new AbortController();
  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, "cierre del worker en curso · esperando el ciclo actual");
    controller.abort();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Reconciliación de la cola única (D-03): recupera lo que quedó `PENDING` (Redis caído, proceso
  // interrumpido a medias) y lo vuelve a encolar. Una pasada al arrancar y luego cada intervalo.
  await reconcileOnce(notificationQueue, logger, 5).catch(() => 0);
  const reconcileTimer = setInterval(() => {
    if (controller.signal.aborted) return;
    void reconcileOnce(notificationQueue, logger, 5).catch(() => 0);
  }, config.EMAIL_RECONCILE_INTERVAL_MS);
  reconcileTimer.unref?.();

  logger.info(
    {
      port: config.WORKER_PORT,
      contract: config.CONTRACT_ADDRESS,
      chainId: config.CHAIN_ID,
      deploymentBlock,
      pollIntervalMs: config.POLL_INTERVAL_MS,
    },
    "worker activo · eventos Sale → email + agregados/histórico en PostgreSQL (/aggregates, /history)",
  );

  // Quema programada (US-09, D-03): planificador diario a las 12:00 de Madrid con cerrojo, o el
  // modo forzado de desarrollo. Sin `BURNER_WALLET_PRIVATE_KEY` no arranca y se avisa.
  const scheduler = startBurnSchedulerIfConfigured(
    config,
    chain,
    createPublicClientFor(chain, config.RPC_URL),
    logger,
    controller.signal,
  );

  // Retención de datos (M9 · ADR-24): los plazos de conservación se cumplen de verdad. Borra
  // sesiones caducadas (la traza pseudonimizada desaparece con la fila), códigos de rescate de
  // operadores que ya no existen y correos enviados con más de `NOTIFICATIONS_RETENTION_DAYS`.
  const retentionScheduler = startRetentionScheduler({
    logger,
    signal: controller.signal,
    intervalMs: config.RETENTION_INTERVAL_MS,
    notificationsRetentionDays: config.NOTIFICATIONS_RETENTION_DAYS,
  });

  // Listener de eventos (D-12): heartbeat, alerta de silencio y alimentación del índice off-chain
  // desde los eventos del contrato canónico (antes nadie lo instanciaba).
  const listenerRuntime = startListenerRuntime({
    listener: new EventListenerService(
      {
        nftAddress: config.CONTRACT_ADDRESS as `0x${string}`,
        devopsEmail: config.DEVOPS_ALERT_EMAIL,
        reorgConfirmations: config.REORG_CONFIRMATIONS,
        silenceThresholdMs: config.SILENCE_THRESHOLD_MS,
      },
      new NFTsRepository(pool),
      notificationQueue,
      createPublicClientFor(chain, config.RPC_URL),
    ),
    publicClient: createPublicClientFor(chain, config.RPC_URL),
    logger,
    signal: controller.signal,
    pollIntervalMs: config.POLL_INTERVAL_MS,
    fromBlock: deploymentBlock,
  });

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
    // El bucle ya terminó (o falló): ahora sí es seguro cerrar servidor, consumidor y stores.
    scheduler?.stop();
    retentionScheduler.stop();
    listenerRuntime.stop();
    clearInterval(reconcileTimer);
    await emailConsumer.stop();
    server.close();
    await store.close();
    await aggregateStore.close();
    await closeDbPool();
    logger.info("worker detenido · recursos liberados");
  }
}

/** Cliente público viem (mismo RPC que el listener) para el planificador de quema. */
function createPublicClientFor(chain: typeof anvilChain | typeof besuChain, rpcUrl: string) {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

/**
 * Arranca el planificador de quema si hay wallet configurada. Nunca impide arrancar el worker: sin
 * clave se registra el aviso y el resto del sistema sigue operativo.
 */
function startBurnSchedulerIfConfigured(
  config: WorkerConfig,
  chain: typeof anvilChain | typeof besuChain,
  publicClient: ReturnType<typeof createPublicClientFor>,
  logger: ReturnType<typeof createLogger>,
  signal: AbortSignal,
): BurnScheduler | null {
  if (!config.BURNER_WALLET_PRIVATE_KEY) {
    logger.warn(
      "sin BURNER_WALLET_PRIVATE_KEY: la quema programada queda DESACTIVADA (define una hot-wallet con BURNER_ROLE para activarla)",
    );
    return null;
  }

  const burnAccount = privateKeyToAccount(config.BURNER_WALLET_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account: burnAccount,
    chain,
    transport: http(config.RPC_URL),
  });

  const service = new BurnerService();
  return startBurnScheduler({
    service,
    publicClient,
    walletClient,
    options: {
      nftContractAddress: config.CONTRACT_ADDRESS as `0x${string}`,
      operatorAddress: burnAccount.address,
      minBalanceNative: config.BURNER_MIN_BALANCE_NATIVE,
      devopsEmail: config.DEVOPS_ALERT_EMAIL,
    },
    logger,
    signal,
    hourLocal: config.BURN_HOUR_LOCAL,
    timeZone: config.BURN_TIMEZONE,
    forceIntervalMs: config.BURN_INTERVAL_MS,
  });
}

/**
 * Resolución del bloque de despliegue: env explícito > registro de despliegues > 0.
 *
 * Si NO hay registro para el `CHAIN_ID` ni `DEPLOYMENT_BLOCK`, el catch-up arrancaría en el
 * bloque génesis (barrido largo y costoso del histórico de la cadena), así que se avisa de forma
 * explícita para que la causa quede clara en los logs.
 */
function resolveDeploymentBlock(
  config: WorkerConfig,
  logger: ReturnType<typeof createLogger>,
): number {
  if (config.DEPLOYMENT_BLOCK !== undefined) {
    return config.DEPLOYMENT_BLOCK;
  }

  const deployment = tryReadDeployment(config.CHAIN_ID);
  if (deployment === null) {
    logger.warn(
      { chainId: config.CHAIN_ID },
      "sin registro de despliegue para CHAIN_ID y sin DEPLOYMENT_BLOCK: el catch-up arrancará desde el bloque génesis (0); define DEPLOYMENT_BLOCK o publica el registro en @hotel/shared/deployments",
    );
    return 0;
  }

  logger.info(
    { chainId: config.CHAIN_ID, deploymentBlock: deployment.deploymentBlock },
    "bloque de despliegue resuelto desde el registro de despliegues",
  );
  return deployment.deploymentBlock;
}

/** `true` para RPC locales (Anvil dev). */
const isLocalRpc = (url: string): boolean =>
  url.includes("127.0.0.1") || url.includes("localhost");

/** Mensaje legible de un error (pino no serializa `Error.message` sin serializador propio). */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

void main().catch((error: unknown) => {
  createLogger("worker").error(
    { error, errorMessage: describeError(error) },
    "fallo al arrancar el worker",
  );
  process.exitCode = 1;
});
