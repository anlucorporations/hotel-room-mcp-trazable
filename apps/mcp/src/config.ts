import { CHAIN_ID } from "@hotel/shared";
import { env, loadEnv, z, type EnvSource } from "@hotel/shared/env";

/**
 * Configuración del MCP server (T0.3). Valida el entorno con fail-fast al arrancar.
 * `ANTHROPIC_API_KEY` (LLM) vive en el API route de la web, no aquí: el MCP nunca custodia
 * claves de firma (RF-12, §8).
 */
const mcpEnvSchema = z.object({
  RPC_URL: env.httpUrl,
  CONTRACT_ADDRESS: env.ethAddress,
  CHAIN_ID: z.coerce.number().int().positive().default(CHAIN_ID),
  MCP_HOST: z.string().min(1).default("0.0.0.0"),
  MCP_PORT: env.port.default(8788),
  /** Bloque de despliegue del contrato; si falta, se resuelve del registro o se usa 0. */
  DEPLOYMENT_BLOCK: z.coerce.number().int().nonnegative().optional(),
});

export type McpConfig = z.infer<typeof mcpEnvSchema>;

export function loadMcpConfig(source?: EnvSource): McpConfig {
  return loadEnv(mcpEnvSchema, source);
}
