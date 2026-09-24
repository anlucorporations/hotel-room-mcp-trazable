import { CHAIN_ID } from "@hotel/shared";
import { emptyAsUndefined, env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del MCP server (T0.3). Valida el entorno con fail-fast al arrancar.
 * `ANTHROPIC_API_KEY` (LLM) vive en el API route de la web, no aquí: el MCP nunca custodia
 * claves de firma (RF-12, §8).
 */
/**
 * Lista separada por comas → array sin vacíos (`""` y `undefined` ⇒ `[]`). Para las allowlists
 * de Host/Origin de la protección DNS-rebinding del transporte Streamable (MINOR#14).
 */
const csvList = z
  .string()
  .optional()
  .transform((raw) =>
    (raw ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const mcpEnvSchema = z.object({
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  CHAIN_ID: z.coerce.number().int().positive().default(CHAIN_ID),
  /**
   * Interfaz de escucha. Por defecto `127.0.0.1` (loopback): el MCP no firma ni custodia, pero
   * exponerlo en `0.0.0.0` sin allowlist habilita DNS-rebinding (MINOR#14). Para exponerlo hay que
   * fijar `MCP_HOST=0.0.0.0` explícitamente y, idealmente, un reverse proxy con allowlist de Origin.
   */
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_PORT: env.port.default(8788),
  /** Hosts permitidos (Host header) para la protección DNS-rebinding; CSV. Vacío ⇒ sin filtro. */
  MCP_ALLOWED_HOSTS: csvList,
  /** Orígenes permitidos (Origin header) para la protección DNS-rebinding; CSV. Vacío ⇒ sin filtro. */
  MCP_ALLOWED_ORIGINS: csvList,
  /** Bloque de despliegue del contrato; si falta, se resuelve del registro o se usa 0. */
  DEPLOYMENT_BLOCK: emptyAsUndefined(z.coerce.number().int().nonnegative()),
});

export type McpConfig = z.infer<typeof mcpEnvSchema>;

export function loadMcpConfig(source?: EnvSource): McpConfig {
  return loadEnv(mcpEnvSchema, source);
}
