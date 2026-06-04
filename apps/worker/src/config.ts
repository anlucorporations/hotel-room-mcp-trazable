import { CHAIN_ID } from "@hotel/shared";
import { env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del worker (T0.3 + T1.4). Valida el entorno con fail-fast al arrancar.
 *
 * Incorpora los secretos del email (SMTP_*), el destinatario de los avisos (ADMIN_EMAIL), el
 * intervalo de polling y, opcionalmente, el bloque de despliegue (DEPLOYMENT_BLOCK). Cero
 * secretos en el repo: sólo se versiona `.env.example`.
 */
const workerEnvSchema = z.object({
  // ── Cadena / arranque ──────────────────────────────────────────────────────
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  CHAIN_ID: z.coerce.number().int().positive().default(CHAIN_ID),
  WORKER_HOST: z.string().min(1).default("0.0.0.0"),
  WORKER_PORT: env.port.default(8787),

  // ── Email (CU-10, RF-09) ───────────────────────────────────────────────────
  SMTP_HOST: env.nonEmpty,
  SMTP_PORT: env.port.default(587),
  SMTP_USER: env.nonEmpty,
  SMTP_PASS: env.nonEmpty,
  SMTP_FROM: env.email,
  ADMIN_EMAIL: env.email,

  // ── Listener de eventos ────────────────────────────────────────────────────
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
  /** Bloque de despliegue del contrato; si falta, se resuelve del registro o se usa 0. */
  DEPLOYMENT_BLOCK: z.coerce.number().int().nonnegative().optional(),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadWorkerConfig(source?: EnvSource): WorkerConfig {
  return loadEnv(workerEnvSchema, source);
}
