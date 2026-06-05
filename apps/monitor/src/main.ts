import { EmailAlerter } from "./alerter";
import { loadMonitorConfig } from "./config";
import { createLogger } from "./logger";
import { MonitorCore } from "./monitor-core";
import { FetchHealthProbe } from "./probe";

/**
 * Punto de entrada del monitor de observabilidad (T3.3 / RNF-17 / CU-16).
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
