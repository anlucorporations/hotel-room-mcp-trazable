/* eslint-disable no-console */
/**
 * verify-mcp-tools.ts — comprueba qué herramientas expone un MCP por HTTP.
 *
 * Se usa para verificar una release **antes** de moverle el tráfico (H5): el canario debe anunciar las
 * cinco herramientas, incluida `searchHotelManuals`.
 *
 *   corepack pnpm --filter @hotel/web exec tsx scripts/verify-mcp-tools.ts <url-del-mcp>/mcp
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2];
if (!url) throw new Error("falta la URL");
const client = new Client({ name: "verificacion-h5", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const { tools } = await client.listTools();
console.log(`herramientas: ${tools.length}`);
for (const tool of tools) console.log(`  · ${tool.name}`);
await client.close();
