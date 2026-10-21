import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  acquireDistributedLock,
  anvilChain,
  besuChain,
  BurnerService,
  closeDbPool,
  CONFIRMATIONS_N,
  EventListenerService,
  getDbPool,
  NFTsRepository,
  NotificationQueueService,
  OperationsRepository,
  OperationalSignatureQueue,
  releaseDistributedLock,
  RoomMintJobsRepository,
  RoomsRepository,
  runMigrations,
} from "@hotel/shared";
import { tryReadDeployment } from "@hotel/shared/deployments";
import { loadWorkerConfig, type WorkerConfig } from "./config";
import {
  createWorkerHealthState,
  workerHealthProvider,
  type AnchorHealth,
  type WorkerHealthState,
} from "./health";
import { createLogger } from "./logger";
import { AnchorOutbox } from "./anchor-outbox";
import { ViemAnchorRelayer } from "./anchor-relayer";
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
import { startSupplyReminderScheduler } from "./supply-reminder-scheduler";
import { startSlaScheduler } from "./sla-scheduler";
import { startPreventiveScheduler } from "./preventive-scheduler";
import { startMintWindowScheduler } from "./mint-window-scheduler";
import { startListenerRuntime } from "./listener-runtime";
import { ViemPublishMinter } from "./mint-publish-relayer";
import { MintPublishProcessor } from "./mint-publish-processor";

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

  // Outbox de anclaje (F3 · D-C18): el worker reclama las firmas `SIGNED` de `on_chain_signatures` y
  // las ancla en `HotelOperations` con la hot wallet del relayer (sin roles). Sin clave o sin
  // contrato no arranca; se avisa y la salud publica `anchor.scheduler = "disabled"`.
  const anchorRuntime = startAnchorOutboxIfConfigured(
    config,
    pool,
    chain,
    logger,
    health,
    controller.signal,
  );

  // Publicación con minteo on-chain (2026-10-21, D-85): procesa `room_mint_jobs`. Los endpoints de
  // publicar solo encolan; este bucle registra la habitación, ancla la huella y mintea la primera
  // noche, y solo entonces deja la habitación PUBLISHED. Sin clave de relayer se avisa y no arranca.
  const mintPublishRuntime = startMintPublishIfConfigured(config, chain, pool, logger, controller.signal);

  // Señal de vida de la quema en `/health` (H-04 de la auditoría V6): si el planificador no arrancó
  // —worker desplegado sin la clave de firma, el fallo real que pasó en producción— se reporta
  // `disabled` y se avisa a DevOps, en vez de dejar solo una línea de log que nadie lee.
  health.setBurnHealth(() => {
    if (scheduler === null) return { scheduler: "disabled", lastRun: null };
    const last = scheduler.lastRun();
    return {
      scheduler: "enabled",
      lastRun:
        last === null
          ? null
          : {
              at: last.at,
              dayKey: last.dayKey,
              reason: last.reason,
              burnedTokensCount: last.burnedTokensCount,
            },
    };
  });

  if (scheduler === null) {
    await notificationQueue
      .enqueueNotification("DEVOPS_ALERT", config.DEVOPS_ALERT_EMAIL || "devops@hotel.es", {
        subject: "ALERTA: la quema programada está DESACTIVADA (falta la clave del firmante)",
        message:
          "El worker ha arrancado sin BURNER_WALLET_PRIVATE_KEY: el planificador diario no existe y las noches caducadas no se quemarán. Provisiona la variable (o el secreto) y reinicia el servicio.",
        timestamp: new Date().toISOString(),
      })
      .catch((error: unknown) => {
        logger.error({ error }, "no se pudo encolar el aviso de quema desactivada");
      });
  }

  // Retención de datos (M9 · ADR-24): los plazos de conservación se cumplen de verdad. Borra
  // sesiones caducadas (la traza pseudonimizada desaparece con la fila), códigos de rescate de
  // operadores que ya no existen y correos enviados con más de `NOTIFICATIONS_RETENTION_DAYS`.
  const retentionScheduler = startRetentionScheduler({
    logger,
    signal: controller.signal,
    intervalMs: config.RETENTION_INTERVAL_MS,
    notificationsRetentionDays: config.NOTIFICATIONS_RETENTION_DAYS,
  });

  // Mantenimiento preventivo (F4 · D-54): aviso diario de las tareas vencidas al responsable. El
  // tablero del técnico las muestra igualmente; esto es el correo «avisa cuando toca».
  const preventiveScheduler = startPreventiveScheduler({
    logger,
    signal: controller.signal,
    intervalMs: config.PREVENTIVE_CHECK_INTERVAL_MS,
    hourLocal: config.PREVENTIVE_HOUR_LOCAL,
    timeZone: config.BURN_TIMEZONE,
    recipient: config.MAINTENANCE_ALERT_EMAIL ?? config.DEVOPS_ALERT_EMAIL,
  });

  // Agotamiento de la ventana de acuñación (F8 · D-17): avisa al responsable cuando una habitación
  // publicada se queda sin noches libres en la ventana, una vez por episodio y por habitación. El
  // aviso in-app ya está en /admin/habitacion; esto es el correo por la cola única (D-03).
  const mintWindowScheduler = startMintWindowScheduler({
    logger,
    signal: controller.signal,
    intervalMs: config.MINT_WINDOW_CHECK_INTERVAL_MS,
    hourLocal: config.MINT_WINDOW_ALERT_HOUR_LOCAL,
    timeZone: config.BURN_TIMEZONE,
    recipient: config.MINT_WINDOW_ALERT_EMAIL ?? config.ADMIN_EMAIL ?? config.DEVOPS_ALERT_EMAIL,
  });

  // Suministros (F8 · D-C33): concilia alertas con el stock y recuerda una vez al día las abiertas.
  const supplyReminderScheduler = startSupplyReminderScheduler({
    logger,
    signal: controller.signal,
    intervalMs: Number(process.env.SUPPLY_REMINDER_INTERVAL_MS ?? 60 * 60_000),
  });

  // SLA de validación del jefe (F8 · RNF-M-21): vencidas a 24 h → escalation al Administrador.
  const slaScheduler = startSlaScheduler({
    logger,
    signal: controller.signal,
    intervalMs: Number(process.env.VALIDATION_SLA_CHECK_INTERVAL_MS ?? 15 * 60_000),
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
    anchorRuntime?.stop();
    mintPublishRuntime?.stop();
    retentionScheduler.stop();
    preventiveScheduler.stop();
    supplyReminderScheduler.stop();
    slaScheduler.stop();
    mintWindowScheduler.stop();
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

/**
 * Arranca el procesador del outbox de **publicación con minteo on-chain** (D-85) si hay clave de
 * relayer. Nunca impide arrancar el worker: sin clave se avisa y las publicaciones quedan en
 * `PENDING` (visibles en el panel), pero el resto del sistema sigue operativo.
 *
 * Un ciclo cada `MINT_ON_PUBLISH_INTERVAL_MS`; el cerrojo distribuido por Redis serializa el envío
 * entre réplicas (misma hot wallet ⇒ mismos nonces). Sin Redis se degrada a instancia única.
 */
function startMintPublishIfConfigured(
  config: WorkerConfig,
  chain: typeof anvilChain | typeof besuChain,
  pool: ReturnType<typeof getDbPool>,
  logger: ReturnType<typeof createLogger>,
  signal: AbortSignal,
): { stop: () => void } | null {
  if (!config.MINTER_RELAYER_PRIVATE_KEY) {
    logger.warn(
      "sin MINTER_RELAYER_PRIVATE_KEY: la publicación con minteo on-chain queda DESACTIVADA (los jobs room_mint_jobs no se procesarán)",
    );
    return null;
  }

  const minter = new ViemPublishMinter({
    rpcUrl: config.RPC_URL,
    contractAddress: config.CONTRACT_ADDRESS as `0x${string}`,
    chain,
    privateKey: config.MINTER_RELAYER_PRIVATE_KEY as `0x${string}`,
    confirmations: CONFIRMATIONS_N,
    timeoutMs: config.RPC_TIMEOUT_MS,
    gasPriceWei: BigInt(config.MINT_TX_GAS_PRICE_WEI),
    gasLimit: BigInt(config.MINT_TX_GAS_LIMIT),
  });
  const processor = new MintPublishProcessor({
    jobs: new RoomMintJobsRepository(pool),
    rooms: new RoomsRepository(pool),
    nfts: new NFTsRepository(pool),
    minter,
    logger,
  });
  const lockKey = `lock:mint-publish:${minter.address.toLowerCase()}`;

  let running = false;
  const tick = async (): Promise<void> => {
    if (signal.aborted || running) return;
    running = true;
    let lockValue: string | null = null;
    let lockUnavailable = false;
    try {
      try {
        lockValue = await acquireDistributedLock(lockKey, 300);
      } catch (error: unknown) {
        lockUnavailable = true;
        logger.warn(
          { error },
          "no se pudo tomar el cerrojo del relayer de publicación (Redis); se procesa sin cerrojo (asume instancia única)",
        );
      }
      if (lockValue === null && !lockUnavailable) {
        // Otra réplica está publicando; se reintenta en el siguiente ciclo.
        return;
      }
      const outcome = await processor.runOnce();
      if (outcome !== "idle") logger.info({ outcome }, "outbox de publicación: ciclo completado");
    } catch (error: unknown) {
      logger.error({ error }, "outbox de publicación: error en el ciclo");
    } finally {
      if (lockValue !== null) {
        await releaseDistributedLock(lockKey, lockValue).catch((error: unknown) => {
          logger.warn({ error }, "no se pudo liberar el cerrojo del relayer de publicación");
        });
      }
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), config.MINT_ON_PUBLISH_INTERVAL_MS);
  void tick();
  logger.info(
    { intervalMs: config.MINT_ON_PUBLISH_INTERVAL_MS, relayer: minter.address },
    "outbox de publicación con minteo on-chain activo",
  );
  return { stop: () => clearInterval(timer) };
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
 * Arranca el **outbox de anclaje** (F3 · D-C18) si hay relayer y contrato configurados. Nunca impide
 * arrancar el worker: sin clave o sin dirección se registra el aviso, la salud publica `disabled` y el
 * resto del sistema sigue operativo.
 *
 * El bucle barre `on_chain_signatures` cada `OPERATIONAL_SIGNATURE_RETRY_MS` (la cola solo lo despierta
 * antes) y publica en `/health` el último ciclo y los contadores del outbox para que el monitor alerte
 * de firmas atascadas (T3.7/T3.8). La recuperación tras reinicio la hace el motor en su primer ciclo.
 */
function startAnchorOutboxIfConfigured(
  config: WorkerConfig,
  pool: ReturnType<typeof getDbPool>,
  chain: typeof anvilChain | typeof besuChain,
  logger: ReturnType<typeof createLogger>,
  health: WorkerHealthState,
  signal: AbortSignal,
): { stop: () => void } | null {
  if (!config.ANCHOR_RELAYER_PRIVATE_KEY) {
    logger.warn(
      "sin ANCHOR_RELAYER_PRIVATE_KEY: el outbox de anclaje queda DESACTIVADO (las firmas SIGNED no se anclarán)",
    );
    return null;
  }
  if (!config.HOTEL_OPERATIONS_CONTRACT_ADDRESS) {
    logger.warn(
      "sin HOTEL_OPERATIONS_CONTRACT_ADDRESS: el outbox de anclaje queda DESACTIVADO",
    );
    return null;
  }

  const repository = new OperationsRepository(pool);
  const relayer = new ViemAnchorRelayer({
    rpcUrl: config.RPC_URL,
    contractAddress: config.HOTEL_OPERATIONS_CONTRACT_ADDRESS as `0x${string}`,
    chain,
    privateKey: config.ANCHOR_RELAYER_PRIVATE_KEY as `0x${string}`,
    confirmations: CONFIRMATIONS_N,
    timeoutMs: config.RPC_TIMEOUT_MS,
  });
  const outbox = new AnchorOutbox({
    repository,
    relayer,
    logger,
    options: {
      maxRetries: config.OPERATIONAL_SIGNATURE_MAX_RETRIES,
      ttlHours: config.OPERATIONAL_SIGNATURE_TTL_HOURS,
      backoffSeconds: config.ANCHOR_BACKOFF,
    },
  });

  let lastCycle: AnchorHealth["lastCycle"] = null;
  let stats: AnchorHealth["stats"] = {
    signed: 0,
    failed: 0,
    oldestSignedAt: null,
    maxRetryCount: 0,
  };
  health.setAnchorHealth(() => ({ scheduler: "enabled", lastCycle, stats }));

  let running = false;
  // Cerrojo por HOT WALLET (F3 · §4.3): dos instancias del worker enviando tx con la misma wallet se
  // pisarían el nonce de transacción. El cerrojo serializa el envío; si Redis no está, se degrada a
  // «instancia única» con aviso (el outbox debe seguir funcionando sin Redis: esa es su razón de ser).
  const relayerAddress = privateKeyToAccount(
    config.ANCHOR_RELAYER_PRIVATE_KEY as `0x${string}`,
  ).address.toLowerCase();
  const lockKey = `lock:anchor-relayer:${relayerAddress}`;

  const tick = async (): Promise<void> => {
    // Un ciclo a la vez en ESTE proceso; entre procesos lo serializan el lease de la fila y el cerrojo.
    if (signal.aborted || running) return;
    let lockValue: string | null = null;
    let lockUnavailable = false;
    try {
      lockValue = await acquireDistributedLock(lockKey, 60);
    } catch (error: unknown) {
      lockUnavailable = true;
      logger.warn(
        { error },
        "no se pudo tomar el cerrojo del relayer (Redis); se ancla sin cerrojo (asume instancia única)",
      );
    }
    if (lockValue === null && !lockUnavailable) return; // otra instancia está anclando ahora mismo

    running = true;
    try {
      const result = await outbox.runOnce();
      lastCycle = {
        at: new Date().toISOString(),
        claimed: result.claimed,
        mined: result.mined,
        failed: result.failed,
      };
      if (result.claimed > 0 || result.failed > 0 || result.errors > 0) {
        logger.info({ ...result }, "outbox de anclaje: ciclo completado");
      }
      const snapshot = await repository.outboxStats();
      stats = {
        signed: snapshot.signed,
        failed: snapshot.failed,
        oldestSignedAt: snapshot.oldestSignedAt?.toISOString() ?? null,
        maxRetryCount: snapshot.maxRetryCount,
      };
    } catch (error: unknown) {
      logger.error({ error }, "fallo del ciclo del outbox de anclaje (se reintentará)");
    } finally {
      running = false;
      if (lockValue !== null) {
        await releaseDistributedLock(lockKey, lockValue).catch((error: unknown) => {
          logger.warn({ error }, "no se pudo liberar el cerrojo del relayer (caducará solo)");
        });
      }
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, config.OPERATIONAL_SIGNATURE_RETRY_MS);
  timer.unref?.();

  // Cola aceleradora (T3.6): solo despierta al relayer; un aviso perdido no pierde trabajo porque el
  // barrido periódico sigue leyendo la tabla.
  const queue = new OperationalSignatureQueue();
  const queueWorker = queue.createWorker(async () => {
    await tick();
  });

  logger.info(
    {
      rpcUrl: config.RPC_URL,
      contract: config.HOTEL_OPERATIONS_CONTRACT_ADDRESS,
      operationsDeploymentBlock: config.HOTEL_OPERATIONS_DEPLOYMENT_BLOCK ?? null,
      retryMs: config.OPERATIONAL_SIGNATURE_RETRY_MS,
      maxRetries: config.OPERATIONAL_SIGNATURE_MAX_RETRIES,
      ttlHours: config.OPERATIONAL_SIGNATURE_TTL_HOURS,
      backoffSeconds: config.ANCHOR_BACKOFF,
    },
    "outbox de anclaje activo · el worker ancla firmas SIGNED con el relayer (sin roles)",
  );

  return {
    stop: () => {
      clearInterval(timer);
      void queueWorker.close();
      void queue.close();
    },
  };
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
