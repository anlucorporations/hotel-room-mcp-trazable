import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ChainReader } from "./chain/chain-reader";
import { ToolError } from "./tools/errors";
import {
  buildPurchaseTxShape,
  checkAvailabilityShape,
  getOwnedNightsShape,
  listAvailableNightsShape,
  prepareStayTxShape,
  getOperationalActionsShape,
  searchHotelManualsShape,
} from "./tools/schemas";
import {
  buildPurchaseTx,
  checkAvailability,
  getOwnedNights,
  listAvailableNights,
  prepareStayTx,
  getOperationalActions,
  searchHotelManuals,
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
 * Crea el MCP server del contrato (RF-12, CU-08, docs/SRS.md §9): **4 herramientas read-only**
 * (`listAvailableNights`, `checkAvailability`, `getOwnedNights`, `searchHotelManuals`) + **2 de
 * preparación sin firma** (`buildPurchaseTx` para una noche y `prepareStayTx` para una estancia de
 * varias noches, petición del responsable 2026-10-13). Las herramientas de cadena delegan en el
 * núcleo (`tools/`), que depende del puerto {@link ChainReader}; `searchHotelManuals` es local
 * (índice en memoria) y no toca la cadena.
 * El MCP **nunca firma ni custodia claves** (§8, ADR-11).
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

  server.registerTool(
    "prepareStayTx",
    {
      description:
        "Prepara la compra de TODAS las noches de una estancia (varias noches seguidas) en una misma habitación: devuelve una transacción SIN firmar por cada noche y el importe total. `checkIn` es la primera noche y `checkOut` la fecha de salida (la noche de salida NO se compra). Si no se indica `room`, elige la primera habitación del `type` pedido con la estancia completa. Es todo o nada: si alguna noche no es comprable, no devuelve plan y hay que ofrecer alternativas con listAvailableNights.",
      inputSchema: prepareStayTxShape,
    },
    async (input) => {
      try {
        return ok(await prepareStayTx(reader, config, input));
      } catch (error) {
        if (error instanceof ToolError) return fail(`${error.code}: ${error.message}`);
        throw error;
      }
    },
  );

  server.registerTool(
    "searchHotelManuals",
    {
      description:
        "Busca en los manuales y protocolos oficiales del hotel (servicios, normas, ubicación, procedimientos) y devuelve los fragmentos más relevantes con su sección y fichero de origen, para poder citarlos. Solo devuelve contenido visible para la audiencia indicada (por defecto, la del huésped).",
      inputSchema: searchHotelManualsShape,
    },
    async (input) => ok(searchHotelManuals(input)),
  );

  server.registerTool(
    "getOperationalActions",
    {
      description:
        "Lee (solo lectura) las acciones operativas ancladas en el contrato HotelOperations: tipo, entidad, huella del payload, firmante, fecha y transacción. El MCP no firma, no custodia claves y no envía transacciones.",
      inputSchema: getOperationalActionsShape,
    },
    async () => ok(await getOperationalActions(reader)),
  );

  return server;
}
