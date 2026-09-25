import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Comprobacion de que la WEB puede hablar con el MCP desplegado: usa el mismo transporte y el mismo
 * cliente que `McpToolGateway` (el que usa el asistente), asi que si esto funciona, la cadena
 * web -> MCP esta sana.
 *
 * Se ejecuta desde `apps/web` (alli resuelve el SDK del MCP):
 *   cd apps/web
 *   node --experimental-strip-types ../../scripts/dev/check-mcp-connection.ts http://127.0.0.1:8790/mcp
 *
 * Si el MCP exige secreto compartido (fuera de loopback), exporta antes `MCP_SHARED_SECRET`.
 */
const url = new URL(process.argv[2] ?? "http://127.0.0.1:8790/mcp");
const client = new Client({ name: "hotel-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: process.env.MCP_SHARED_SECRET
    ? { headers: { authorization: `Bearer ${process.env.MCP_SHARED_SECRET}` } }
    : undefined,
});

await client.connect(transport);
const { tools } = await client.listTools();
console.log("herramientas:", tools.map((t) => t.name).join(", "));

const nights = JSON.parse(
  (await client.callTool({ name: "listAvailableNights", arguments: { dateFrom: 20260101, dateTo: 20271231 } }))
    .content.find((c) => c.type === "text")?.text ?? "[]",
);
console.log("listAvailableNights:", Array.isArray(nights) ? `${nights.length} noches` : JSON.stringify(nights).slice(0, 120));

const owned = JSON.parse(
  (await client.callTool({
    name: "getOwnedNights",
    arguments: { wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  })).content.find((c) => c.type === "text")?.text ?? "[]",
);
console.log("getOwnedNights:", Array.isArray(owned) ? `${owned.length} noches` : JSON.stringify(owned).slice(0, 120));

await client.close();
