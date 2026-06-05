import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ChainReader } from "./chain/chain-reader";
import { ToolError } from "./tools/errors";
import {
  buildPurchaseTxShape,
  checkAvailabilityShape,
  getOwnedNightsShape,
  listAvailableNightsShape,
} from "./tools/schemas";
import {
  buildPurchaseTx,
  checkAvailability,
  getOwnedNights,
  listAvailableNights,
  type ToolConfig,
} from "./tools/tools";

export interface McpServerDeps {
  readonly reader: ChainReader;
  readonly config: ToolConfig;
}

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
});

const fail = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * Crea el MCP server del contrato (RF-12, CU-08): 3 herramientas read-only + `buildPurchaseTx`
 * (sin firma). Las herramientas delegan en el núcleo (`tools/`), que depende del puerto
 * {@link ChainReader}. El MCP **nunca firma ni custodia claves** (§8, ADR-11).
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({ name: "hotel-nights-mcp", version: "1.0.0" });
  const { reader, config } = deps;

  server.registerTool(
    "listAvailableNights",
    {
      description:
        "Lista las noches comprables (DISPONIBLE en primaria y LISTADA en reventa) dentro de una ventana de fechas (AAAAMMDD), con filtro opcional por tipo de habitación.",
      inputSchema: listAvailableNightsShape,
    },
    async (input) => ok(await listAvailableNights(reader, input)),
  );

  server.registerTool(
    "checkAvailability",
    {
      description:
        "Comprueba si una noche concreta (habitación + fecha AAAAMMDD) existe y es comprable, devolviendo su tokenId y precio.",
      inputSchema: checkAvailabilityShape,
    },
    async (input) => ok(await checkAvailability(reader, input)),
  );

  server.registerTool(
    "getOwnedNights",
    {
      description: "Lista las noches (NFTs) que posee actualmente una wallet.",
      inputSchema: getOwnedNightsShape,
    },
    async (input) => ok(await getOwnedNights(reader, input)),
  );

  server.registerTool(
    "buildPurchaseTx",
    {
      description:
        "Devuelve los datos de la transacción de compra de una noche (to, data, value, chainId) SIN firmarla; el usuario la firma en su wallet. Rechaza noches inexistentes o no comprables.",
      inputSchema: buildPurchaseTxShape,
    },
    async (input) => {
      try {
        return ok(await buildPurchaseTx(reader, config, input));
      } catch (error) {
        if (error instanceof ToolError) return fail(`${error.code}: ${error.message}`);
        throw error;
      }
    },
  );

  return server;
}
