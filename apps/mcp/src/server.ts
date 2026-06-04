import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Crea el MCP server del contrato (RF-12, CU-08).
 *
 * FASE 0: sin herramientas. Las 4 read-only (`listAvailableNights`, `checkAvailability`,
 * `getOwnedNights`) y `buildPurchaseTx` (sin firma) se incorporan en T4.1; el LLM se
 * orquesta server-side en el API route de la web. El MCP nunca firma ni custodia claves
 * (§8, ADR-11).
 */
export function createMcpServer(): McpServer {
  return new McpServer({ name: "hotel-nights-mcp", version: "0.0.0" });
}
