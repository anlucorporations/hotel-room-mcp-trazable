import { HEALTH_FAILURE_THRESHOLD } from "@hotel/shared";
import { emptyAsUndefined, env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del monitor de observabilidad (T3.3, RNF-17, TC-NF-020). Valida el entorno
 * con fail-fast al arrancar.
 *
 * `MONITOR_TARGETS` es una lista "nombre=url" separada por comas (p. ej.
 * `worker=http://127.0.0.1:8787/health,mcp=http://127.0.0.1:8788/health`) que se parsea a
 * `{ name, url }[]`. El resto de variables fijan los umbrales del sondeo y los secretos SMTP
 * del canal de alerta. Cero secretos en el repo: sólo se versiona `.env.example`.
 */
export interface MonitorTarget {
  readonly name: string;
  readonly url: string;
}

/**
 * Esquema de un único par "nombre=url". Acota el contrato en un solo punto (DRY): la lista
 * completa se construye a partir de él.
 */
const targetSchema = z
  .string()
  .transform((entry) => entry.trim())
  .refine((entry) => entry.length > 0, "no puede estar vacío")
  .transform((entry, ctx): MonitorTarget => {
    const separatorIndex = entry.indexOf("=");
    const name = separatorIndex >= 0 ? entry.slice(0, separatorIndex).trim() : "";
    const url = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : "";
    if (name.length === 0 || url.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `formato inválido (se espera "nombre=url"): "${entry}"`,
      });
      return z.NEVER;
    }
    const parsedUrl = z.string().url().safeParse(url);
    if (!parsedUrl.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `URL inválida en el target "${name}": "${url}"`,
      });
      return z.NEVER;
    }
    return { name, url };
  });

const targetsSchema = z
  .string()
  .transform((raw) => raw.split(",").filter((entry) => entry.trim().length > 0))
  .pipe(z.array(targetSchema).min(1, "debe definir al menos un target"));

const monitorEnvSchema = z.object({
  // ── Targets a sondear ────────────────────────────────────────────────────────
  MONITOR_TARGETS: targetsSchema,

  // ── Umbrales del sondeo ──────────────────────────────────────────────────────
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** Lag (de `details.lag`) por encima del cual el componente se considera en fallo. */
  LAG_THRESHOLD: z.coerce.number().int().nonnegative().default(50),
  /** Fallos consecutivos antes de alertar. */
  FAILURE_THRESHOLD: z.coerce.number().int().positive().default(HEALTH_FAILURE_THRESHOLD),

  // ── Email de alerta (CU-16, docs/SRS.md §9, RF-09) ───────────────────────────────────────────
  SMTP_HOST: env.nonEmpty,
  SMTP_PORT: env.port.default(587),
  SMTP_USER: env.nonEmpty,
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: env.emailWithDisplay,
  ALERT_EMAIL: env.email,

  // ── Cadena y gas (D-12) ──────────────────────────────────────────────────────
  /** RPC a vigilar (por defecto, el de la aplicación). Vacío (`VAR=`) = no definido. */
  CHAIN_RPC_URL: emptyAsUndefined(z.string().url()),
  CHAIN_ID: z.coerce.number().int().positive().default(81234),
  /**
   * Wallets a vigilar, en formato `nombre=dirección[,nombre=dirección]`. Sin valor, el monitor solo
   * comprueba la viveza de la cadena.
   */
  GAS_WALLETS: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const index = entry.indexOf("=");
          return { name: entry.slice(0, index).trim(), address: entry.slice(index + 1).trim() };
        })
        .filter((wallet) => wallet.name.length > 0 && /^0x[0-9a-fA-F]{40}$/.test(wallet.address))
        .map((wallet) => ({ name: wallet.name, address: wallet.address as `0x${string}` })),
    ),
  /** Saldo mínimo (moneda nativa) antes de alertar por una wallet. */
  MIN_GAS_NATIVE: z.coerce.number().nonnegative().default(1),
  /** Ciclos consecutivos sin bloque nuevo antes de alertar (por defecto 3). */
  STALL_CYCLES: z.coerce.number().int().positive().default(3),
});

export type MonitorConfig = z.infer<typeof monitorEnvSchema>;

export function loadMonitorConfig(source?: EnvSource): MonitorConfig {
  return loadEnv(monitorEnvSchema, source);
}
