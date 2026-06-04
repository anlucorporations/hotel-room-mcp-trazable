import { CHAIN_ID } from "@hotel/shared";
import { env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del worker (T0.3). Valida el entorno con fail-fast al arrancar.
 *
 * Los secretos del email (SMTP_*) y el email del admin se incorporan a su propio módulo de
 * configuración en T1.4 (ISP: cada feature posee su contrato de secretos). Aquí solo lo que
 * el worker necesita para arrancar y leer la cadena.
 */
const workerEnvSchema = z.object({
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  CHAIN_ID: z.coerce.number().int().positive().default(CHAIN_ID),
  WORKER_HOST: z.string().min(1).default("0.0.0.0"),
  WORKER_PORT: env.port.default(8787),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadWorkerConfig(source?: EnvSource): WorkerConfig {
  return loadEnv(workerEnvSchema, source);
}
