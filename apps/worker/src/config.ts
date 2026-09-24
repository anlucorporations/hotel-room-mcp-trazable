import { CHAIN_ID } from "@hotel/shared";
import { emptyAsUndefined, env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del worker (T0.3 + T1.4). Valida el entorno con fail-fast al arrancar.
 *
 * Incorpora los secretos del email (SMTP_*), el destinatario de los avisos (ADMIN_EMAIL), el
 * intervalo de polling y, opcionalmente, el bloque de despliegue (DEPLOYMENT_BLOCK). Cero
 * secretos en el repo: sólo se versiona `.env.example`.
 *
 * Las variables OPCIONALES se declaran con `emptyAsUndefined`: la plantilla las deja vacías
 * (`VAR=`), y sin eso el propio `.env.example` producía un worker que no arrancaba.
 */
const workerEnvSchema = z.object({
  // ── Cadena / arranque ──────────────────────────────────────────────────────
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  CHAIN_ID: z.coerce.number().int().positive().default(CHAIN_ID),
  WORKER_HOST: z.string().min(1).default("0.0.0.0"),
  WORKER_PORT: env.port.default(8787),

  // ── Email (CU-10, docs/SRS.md §9, RF-09) ───────────────────────────────────────────────────
  SMTP_HOST: env.nonEmpty,
  SMTP_PORT: env.port.default(587),
  SMTP_USER: env.nonEmpty,
  // Vacío permitido: en desarrollo o demo puede no haber proveedor de correo. El envío fallará
  // y quedará registrado para reconciliación, pero el worker arranca y el resto del sistema es
  // utilizable. En producción se define siempre.
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: env.emailWithDisplay,
  ADMIN_EMAIL: env.email,

  // ── Listener de eventos ────────────────────────────────────────────────────
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
  /** Bloque de despliegue del contrato; si falta, se resuelve del registro o se usa 0. */
  DEPLOYMENT_BLOCK: emptyAsUndefined(z.coerce.number().int().nonnegative()),

  // ── Quema programada (US-09, D-03) ─────────────────────────────────────────
  /**
   * Clave de la hot-wallet con `BURNER_ROLE`. Si falta, el planificador de quema no arranca (el
   * resto del worker sí): en producción debe ser una wallet DEDICADA con solo ese rol.
   */
  BURNER_WALLET_PRIVATE_KEY: emptyAsUndefined(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, "BURNER_WALLET_PRIVATE_KEY debe ser una clave privada 0x + 64 hex"),
  ),
  /** Umbral de aviso de saldo de la wallet de quema (moneda nativa). */
  BURNER_MIN_BALANCE_NATIVE: z.coerce.number().nonnegative().default(1),
  /**
   * Hora local del hotel de la quema diaria y su zona horaria. La quema es a las **12:00 del
   * hotel** (hora de salida), no a las 12:00 UTC: en un hotel en otra zona se cambia `BURN_TIMEZONE`
   * (p. ej. `UTC`) sin tocar código.
   */
  BURN_HOUR_LOCAL: z.coerce.number().int().min(0).max(23).default(12),
  BURN_TIMEZONE: z.string().min(1).default("Europe/Madrid"),
  /** Solo dev/demo: ejecuta el ciclo cada N ms sin esperar a la hora configurada. */
  BURN_INTERVAL_MS: emptyAsUndefined(z.coerce.number().int().positive()),
  /** Destinatario de las alertas de operación (DevOps). */
  DEVOPS_ALERT_EMAIL: emptyAsUndefined(env.email),

  // ── Cola única de correo (D-03) ────────────────────────────────────────────
  /** Periodo de reconciliación de notificaciones `PENDING` (por defecto, 5 minutos). */
  EMAIL_RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),

  // ── Retención de datos (M9 · ADR-24) ───────────────────────────────────────
  /** Periodo entre limpiezas (sesiones caducadas, códigos huérfanos y correos viejos). */
  RETENTION_INTERVAL_MS: z.coerce.number().int().positive().default(6 * 3600_000),
  /** Días que se conservan las notificaciones ya enviadas (minimización de datos). */
  NOTIFICATIONS_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // ── Listener de eventos (D-12) ─────────────────────────────────────────────
  /** Confirmaciones antes de consolidar un evento (1 en Anvil; 32 en Polygon). */
  REORG_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(1),
  /** Silencio (ms) sin bloques antes de alertar a DevOps (por defecto, 10 minutos). */
  SILENCE_THRESHOLD_MS: z.coerce.number().int().positive().default(600_000),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadWorkerConfig(source?: EnvSource): WorkerConfig {
  return loadEnv(workerEnvSchema, source);
}
