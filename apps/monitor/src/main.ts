import { fileURLToPath } from "node:url";
import { EmailAlerter } from "./alerter";
import { startChainMonitor } from "./chain-monitor";
import { loadMonitorConfig } from "./config";
import { createLogger } from "./logger";
import { MonitorCore } from "./monitor-core";
import { FetchHealthProbe } from "./probe";

// Node no carga `.env` por si solo (Next.js si lo hace): en desarrollo lo cargamos desde la
// raiz del monorepo. Si el fichero no existe se usan las variables del entorno (CI/contenedor),
// que es el caso de produccion; por eso no es un error.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // Sin fichero .env: no es un error.
}
/**
 * Punto de entrada del monitor de observabilidad (T3.3 / RNF-17 / CU-16, docs/SRS.md §9).
 *
 * Carga la configuración (fail-fast), crea las implementaciones concretas (fetch, nodemailer)
 * y lanza el bucle de sondeo. Maneja SIGINT/SIGTERM para un cierre limpio del bucle.
 */
async function main(): Promise<void> {
  const logger = createLogger("monitor");
  const config = loadMonitorConfig();

  const probe = new FetchHealthProbe();
  const alerter = new EmailAlerter({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
    from: config.SMTP_FROM,
    to: config.ALERT_EMAIL,
  });

  const core = new MonitorCore({ probe, alerter, config, logger });

  const controller = new AbortController();
  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, "cierre del monitor en curso");
    controller.abort();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Vigilancia de cadena y gas (D-12): el monitor ya no depende de que cada servicio avise de su
  // propio saldo. Sin RPC configurado usa el de la aplicación.
  const chainMonitor = startChainMonitor({
    config: {
      rpcUrl: config.CHAIN_RPC_URL ?? process.env.RPC_URL ?? "http://127.0.0.1:8545",
      chainId: config.CHAIN_ID,
      pollIntervalMs: config.POLL_INTERVAL_MS,
      wallets: config.GAS_WALLETS,
      minNative: config.MIN_GAS_NATIVE,
      stallCycles: config.STALL_CYCLES,
    },
    alerter,
    logger,
    signal: controller.signal,
  });
  controller.signal.addEventListener("abort", () => chainMonitor.stop());

  logger.info(
    {
      targets: config.MONITOR_TARGETS.map((target) => target.name),
      pollIntervalMs: config.POLL_INTERVAL_MS,
      lagThreshold: config.LAG_THRESHOLD,
      failureThreshold: config.FAILURE_THRESHOLD,
    },
    "monitor activo · sondeando /health → alerta por email",
  );

  await core.start(controller.signal);
}

void main().catch((error: unknown) => {
  createLogger("monitor").error({ error }, "fallo al arrancar el monitor");
  process.exitCode = 1;
});
