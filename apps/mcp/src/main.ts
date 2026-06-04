import { startHealthServer } from "@hotel/shared/health";
import { loadMcpConfig } from "./config";
import { mcpHealthProvider } from "./health";
import { createLogger } from "./logger";

/**
 * Punto de entrada del MCP server (RF-12).
 *
 * FASE 0: arranca el `/health` (RNF-17) tras validar la configuración (fail-fast). Las
 * herramientas read-only, `buildPurchaseTx` y el transporte HTTP llegan en T4.1.
 */
async function main(): Promise<void> {
  const logger = createLogger("mcp");
  const config = loadMcpConfig();

  await startHealthServer({
    host: config.MCP_HOST,
    port: config.MCP_PORT,
    provider: mcpHealthProvider(),
  });

  logger.info(
    {
      port: config.MCP_PORT,
      contract: config.CONTRACT_ADDRESS,
      chainId: config.CHAIN_ID,
    },
    "mcp /health activo · herramientas y transporte HTTP pendientes (T4.1)",
  );
}

void main().catch((error: unknown) => {
  createLogger("mcp").error({ error }, "fallo al arrancar el MCP server");
  process.exitCode = 1;
});
