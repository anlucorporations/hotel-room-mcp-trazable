import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolGateway } from "./tools-gateway";
import type { ToolDescriptor } from "./types";

/**
 * Adaptador del puerto {@link ToolGateway} que habla con el MCP server por HTTP (transporte
 * Streamable, ADR-11). Conexión perezosa y reutilizada durante la petición; `close()` al final.
 */
export class McpToolGateway implements ToolGateway {
  private readonly client: Client;
  private transport?: StreamableHTTPClientTransport;
  private connected = false;

  constructor(private readonly url: URL) {
    this.client = new Client({ name: "hotel-web", version: "1.0.0" });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    // Se guarda el transporte antes de `connect`: si éste falla a medias, `close()` lo libera igual.
    this.transport = new StreamableHTTPClientTransport(this.url);
    await this.client.connect(this.transport);
    this.connected = true;
  }

  async listTools(): Promise<ToolDescriptor[]> {
    await this.ensureConnected();
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    const result = (await this.client.callTool({ name, arguments: args })) as CallToolResult;
    const text = result.content.find((c) => c.type === "text")?.text ?? "{}";
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
  }

  async close(): Promise<void> {
    if (!this.transport) return;
    try {
      await this.client.close();
    } finally {
      this.transport = undefined;
      this.connected = false;
    }
  }
}
