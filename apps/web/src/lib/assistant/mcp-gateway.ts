import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolGateway } from "./tools-gateway";
import type { ToolDescriptor } from "./types";

/** Opciones del gateway. El secreto es OPCIONAL: el demo loopback funciona sin él. */
export interface McpGatewayOptions {
  /**
   * Secreto compartido para autenticar contra el MCP cuando éste NO está en loopback (MINOR#24).
   * Si se define, se envía como `Authorization: Bearer <secreto>` en cada conexión y el MCP debe
   * exigirlo. Si el MCP escucha en loopback/red privada (el caso del demo), se deja sin definir.
   */
  readonly sharedSecret?: string;
}

/** Hosts considerados loopback (no requieren secreto; confianza por aislamiento de red). */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Adaptador del puerto {@link ToolGateway} que habla con el MCP server por HTTP (transporte
 * Streamable, ADR-11). Conexión perezosa y reutilizada durante la petición; `close()` al final.
 *
 * Seguridad de transporte (MINOR#24): el gateway confía en la red. El MCP DEBE escuchar en
 * loopback o tras red privada. Si `MCP_BASE_URL` cruza red (host no loopback), se exige un
 * secreto compartido (`MCP_SHARED_SECRET`) que viaja como cabecera `Authorization: Bearer`;
 * sin él, el constructor avisa para no establecer confianza implícita en una red no aislada.
 */
export class McpToolGateway implements ToolGateway {
  private readonly client: Client;
  private transport?: StreamableHTTPClientTransport;
  private connected = false;
  private readonly sharedSecret?: string;

  constructor(
    private readonly url: URL,
    options: McpGatewayOptions = {},
  ) {
    this.client = new Client({ name: "hotel-web", version: "1.0.0" });
    this.sharedSecret = options.sharedSecret;
    if (!isLoopback(url) && !this.sharedSecret) {
      // No se rompe el arranque (puede haber un reverse proxy de confianza por delante), pero se
      // deja constancia: cruzar red sin secreto es confianza implícita y no es apto para producción.
      console.warn(
        "[mcp-gateway] MCP_BASE_URL no es loopback y no hay MCP_SHARED_SECRET: confianza implícita en la red.",
      );
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    // Se guarda el transporte antes de `connect`: si éste falla a medias, `close()` lo libera igual.
    // Si hay secreto compartido, se inyecta como cabecera de autenticación en cada petición HTTP.
    this.transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: this.sharedSecret
        ? { headers: { authorization: `Bearer ${this.sharedSecret}` } }
        : undefined,
    });
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
