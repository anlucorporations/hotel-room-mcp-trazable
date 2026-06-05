import type { Address } from "viem";
import { anvilChain, besuChain } from "@hotel/shared";
import { tryReadDeployment } from "@hotel/shared/deployments";
import { loadMcpConfig } from "./config";
import { ViemChainReader } from "./chain/viem-chain-reader";
import { mcpHealthProvider } from "./health";
import { startMcpHttpServer } from "./http-server";
import { createLogger } from "./logger";

/**
 * Punto de entrada del MCP server del contrato (RF-12, CU-08, T4.1).
 *
 * Valida la configuración (fail-fast), construye el lector de cadena (solo lectura) y arranca
 * el HTTP server con `/health` (RNF-17) y `/mcp` (transporte Streamable HTTP). El MCP nunca
 * firma ni custodia claves (§8, ADR-11).
 */
const isLocalRpc = (url: string): boolean =>
  url.includes("localhost") || url.includes("127.0.0.1");

async function main(): Promise<void> {
  const logger = createLogger("mcp");
  const config = loadMcpConfig();

  const deploymentBlock =
    config.DEPLOYMENT_BLOCK ?? tryReadDeployment(config.CHAIN_ID)?.deploymentBlock ?? 0;
  if (deploymentBlock === 0) {
    logger.warn(
      "DEPLOYMENT_BLOCK sin resolver (ni env ni registro): las lecturas escanearán desde el bloque génesis (0)",
    );
  }

  // Cadena viem: Anvil (RPC local) o Besu. Ambas comparten CHAIN_ID; se distingue por la URL.
  const chain = isLocalRpc(config.RPC_URL) ? anvilChain : besuChain;
  const contractAddress = config.CONTRACT_ADDRESS as Address;

  const reader = new ViemChainReader({
    rpcUrl: config.RPC_URL,
    chain,
    contractAddress,
    deploymentBlock: BigInt(deploymentBlock),
  });

  await startMcpHttpServer({
    host: config.MCP_HOST,
    port: config.MCP_PORT,
    healthProvider: mcpHealthProvider(reader),
    deps: { reader, config: { contractAddress, chainId: config.CHAIN_ID } },
    onError: (error) => logger.error({ error }, "error atendiendo una petición MCP"),
  });

  logger.info(
    { port: config.MCP_PORT, contract: config.CONTRACT_ADDRESS, chainId: config.CHAIN_ID, deploymentBlock },
    "mcp activo · /health + /mcp (4 herramientas: read-only + buildPurchaseTx)",
  );
}

void main().catch((error: unknown) => {
  createLogger("mcp").error({ error }, "fallo al arrancar el MCP server");
  process.exitCode = 1;
});
