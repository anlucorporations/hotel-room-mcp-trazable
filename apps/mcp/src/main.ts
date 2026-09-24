import { fileURLToPath } from "node:url";
import type { Address } from "viem";
import { anvilChain, besuChain } from "@hotel/shared";
import { tryReadDeployment } from "@hotel/shared/deployments";
import { loadMcpConfig } from "./config";
import { ViemChainReader } from "./chain/viem-chain-reader";
import { mcpHealthProvider } from "./health";
import { startMcpHttpServer } from "./http-server";
import { createLogger } from "./logger";

// Node no carga `.env` por si solo (Next.js si lo hace): en desarrollo lo cargamos desde la
// raiz del monorepo. Si el fichero no existe se usan las variables del entorno (CI/contenedor),
// que es el caso de produccion; por eso no es un error.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // Sin fichero .env: no es un error.
}
/**
 * Punto de entrada del MCP server del contrato (RF-12, CU-08, docs/SRS.md §9, T4.1).
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

  // Binding seguro por defecto (MINOR#14): loopback salvo configuración explícita. Exponer en una
  // interfaz pública sin allowlist habilita DNS-rebinding; avisamos para forzar reverse proxy/allowlist.
  const isLoopbackHost = config.MCP_HOST === "127.0.0.1" || config.MCP_HOST === "::1";
  const hasAllowlist = config.MCP_ALLOWED_HOSTS.length > 0 || config.MCP_ALLOWED_ORIGINS.length > 0;
  if (!isLoopbackHost && !hasAllowlist) {
    logger.warn(
      { host: config.MCP_HOST },
      "MCP escuchando fuera de loopback sin allowlist (MCP_ALLOWED_HOSTS/ORIGINS): " +
        "expón solo tras reverse proxy con allowlist de Origin o habilita la protección DNS-rebinding",
    );
  }

  await startMcpHttpServer({
    host: config.MCP_HOST,
    port: config.MCP_PORT,
    healthProvider: mcpHealthProvider(reader),
    deps: { reader, config: { contractAddress, chainId: config.CHAIN_ID } },
    onError: (error) => logger.error({ error }, "error atendiendo una petición MCP"),
    allowedHosts: config.MCP_ALLOWED_HOSTS,
    allowedOrigins: config.MCP_ALLOWED_ORIGINS,
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
