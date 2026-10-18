import { CHAIN_ID, OPERATIONAL_SIGNATURE_QUEUE } from "@hotel/shared";
import { emptyAsUndefined, env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del worker (T0.3 + T1.4 + T3.4). Valida el entorno con fail-fast al arrancar.
 *
 * Incorpora los secretos del email (SMTP_*), el destinatario de los avisos (ADMIN_EMAIL), el
 * intervalo de polling, el bloque de despliegue (DEPLOYMENT_BLOCK) y los parámetros del **outbox
 * de anclaje** de vNext (`HOTEL_OPERATIONS_*`, `ANCHOR_*`, `OPERATIONAL_SIGNATURE_*`, …). Cero
 * secretos en el repo: sólo se versiona `.env.example`.
 *
 * Las variables OPCIONALES se declaran con `emptyAsUndefined`: la plantilla las deja vacías
 * (`VAR=`), y sin eso el propio `.env.example` producía un worker que no arrancaba.
 */

/** Valor por defecto de `ANCHOR_BACKOFF` (segundos). */
export const DEFAULT_ANCHOR_BACKOFF = "30,60,120,300,600";

/**
 * Parsea `ANCHOR_BACKOFF`: una lista de **SEGUNDOS** separada por comas.
 *
 * ⚠️ Los valores por defecto son 30 s → 1 → 2 → 5 → 10 **min**, es decir, la lista está en
 * SEGUNDOS (`30,60,120,300,600`), **NO en minutos**. El comentario histórico de `.env.example`
 * («secuencia de backoff de anclaje (min)») es incorrecto: interpretarlo como minutos retrasaría
 * el primer reintento a los 30 minutos. Ver `documento_tecnico.md` §4.7.
 *
 * - Cadena vacía o sólo espacios → valor por defecto (`30,60,120,300,600`).
 * - Lanza si algún elemento no es un entero positivo (no se aceptan vacíos intermedios,
 *   decimales ni negativos).
 */
export function parseAnchorBackoff(raw: string): number[] {
  if (raw.trim() === "") {
    return DEFAULT_ANCHOR_BACKOFF.split(",").map(Number);
  }
  return raw.split(",").map((token) => {
    const value = token.trim();
    if (!/^[0-9]+$/.test(value)) {
      throw new Error(
        `ANCHOR_BACKOFF debe ser una lista de segundos enteros separada por comas (p. ej. "30,60,120"); valor inválido: "${token}"`,
      );
    }
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new Error(
        `ANCHOR_BACKOFF debe contener enteros positivos (segundos > 0); valor inválido: "${token}"`,
      );
    }
    return seconds;
  });
}

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

  // ── Mantenimiento preventivo (F4 · D-54) ───────────────────────────────────
  /** Hora local del hotel a la que se avisa de las tareas preventivas vencidas (por defecto 8). */
  PREVENTIVE_HOUR_LOCAL: z.coerce.number().int().min(0).max(23).default(8),
  /** Periodo con el que se comprueba la hora del aviso preventivo (por defecto, 1 hora). */
  PREVENTIVE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3600_000),
  /** Destinatario del aviso preventivo; si falta, cae al correo de alertas de operación. */
  MAINTENANCE_ALERT_EMAIL: emptyAsUndefined(env.email),

  // ── Aviso de agotamiento de la ventana de acuñación (F8 · D-17) ─────────────
  /** Hora local del hotel a la que se comprueba el agotamiento (por defecto 8). */
  MINT_WINDOW_ALERT_HOUR_LOCAL: z.coerce.number().int().min(0).max(23).default(8),
  /** Periodo con el que se comprueba la hora del aviso de agotamiento (por defecto, 1 hora). */
  MINT_WINDOW_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(3600_000),
  /** Destinatario del aviso de agotamiento; si falta, cae a `ADMIN_EMAIL`. */
  MINT_WINDOW_ALERT_EMAIL: emptyAsUndefined(env.email),

  // ── Listener de eventos (D-12) ─────────────────────────────────────────────
  /** Confirmaciones antes de consolidar un evento (1 en Anvil; 32 en Polygon). */
  REORG_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(1),
  /** Silencio (ms) sin bloques antes de alertar a DevOps (por defecto, 10 minutos). */
  SILENCE_THRESHOLD_MS: z.coerce.number().int().positive().default(600_000),

  // ── Outbox de anclaje y worker relayer (F3 · D-C18, DT-AUD-01/06/12) ───────
  /**
   * Dirección del contrato `HotelOperations`. Si falta, **el anclaje no arranca** (el resto del
   * worker sí): no hay a dónde enviar la transacción. El MCP la consume en modo read-only.
   */
  HOTEL_OPERATIONS_CONTRACT_ADDRESS: emptyAsUndefined(env.ethAddress),
  /** Bloque de despliegue de `HotelOperations`; se usa para el *catch-up* del outbox al arrancar. */
  HOTEL_OPERATIONS_DEPLOYMENT_BLOCK: emptyAsUndefined(z.coerce.number().int().nonnegative()),
  /**
   * Clave privada de la **hot wallet del relayer**, que en `HotelOperations` **NO tiene roles**
   * (DT-AUD-01): solo paga gas y envía la meta-transacción; el contrato verifica la firma EIP-712
   * del jefe y emite `signer = recovered_signer`. Si falta, el outbox queda desactivado y se avisa.
   */
  ANCHOR_RELAYER_PRIVATE_KEY: emptyAsUndefined(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, "ANCHOR_RELAYER_PRIVATE_KEY debe ser una clave privada 0x + 64 hex"),
  ),
  /**
   * Feature flag **solo dev/test**: en producción el anclaje se activa con la clave del relayer y
   * la dirección del contrato, no con este flag. Ojo: `z.coerce.boolean()` considera `true`
   * cualquier cadena no vacía (incluido `"false"`); para desactivarlo, déjalo **vacío**.
   */
  ENABLE_OPERATIONAL_SIGNATURES: z.coerce.boolean().default(false),
  /** Nombre de la cola que solo **despierta** al relayer; el outbox real es `on_chain_signatures`. */
  OPERATIONAL_SIGNATURE_QUEUE: z.string().min(1).default(OPERATIONAL_SIGNATURE_QUEUE),
  /** Reintento base del outbox de anclaje, en ms (por defecto, 30 000). */
  OPERATIONAL_SIGNATURE_RETRY_MS: z.coerce.number().int().positive().default(30_000),
  /** Máximo de reintentos de anclaje antes de marcar la firma `FAILED` (por defecto, 8). */
  OPERATIONAL_SIGNATURE_MAX_RETRIES: z.coerce.number().int().positive().default(8),
  /** TTL del trabajo de anclaje en la cola, en horas (por defecto, 24). */
  OPERATIONAL_SIGNATURE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  /**
   * Secuencia de backoff del outbox en **SEGUNDOS** (`30 s → 1 → 2 → 5 → 10 min`), no en minutos.
   * Cadena vacía → default. Se expone como `number[]` (ver `parseAnchorBackoff`).
   */
  ANCHOR_BACKOFF: z
    .string()
    .default(DEFAULT_ANCHOR_BACKOFF)
    .transform((raw, ctx) => {
      try {
        return parseAnchorBackoff(raw);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "ANCHOR_BACKOFF inválido",
        });
        return z.NEVER;
      }
    }),
  /** Timeout de RPC por intento del relayer, en ms (por defecto, 5 000). */
  RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  /** Minutos sin anclar antes de alertar por una firma `PENDING` (RNF-M-13; por defecto, 10). */
  PENDING_ALERT_MIN: z.coerce.number().int().positive().default(10),
  /** Reintentos del outbox antes de alertar (por defecto, 5). */
  RETRY_ALERT_COUNT: z.coerce.number().int().positive().default(5),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadWorkerConfig(source?: EnvSource): WorkerConfig {
  return loadEnv(workerEnvSchema, source);
}
