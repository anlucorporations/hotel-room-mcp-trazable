import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HealthProvider } from "@hotel/shared/health";
import { createMcpServer, type McpServerDeps } from "./server";

/**
 * Servidor HTTP del MCP (RNF-17, ADR-11): expone `GET /health` (monitorizado por el monitor,
 * TC-NF-020) y `POST /mcp` (transporte Streamable HTTP del SDK, modo *stateless* con respuesta
 * JSON). El orquestador LLM de la web habla con el MCP por este transporte.
 */
export interface McpHttpServerOptions {
  readonly host: string;
  readonly port: number;
  readonly healthProvider: HealthProvider;
  readonly deps: McpServerDeps;
  readonly onError?: (error: unknown) => void;
}

const HEALTH_PATH = "/health";
const MCP_PATH = "/mcp";
/** Cota del cuerpo de `/mcp` (el MCP es un singleton sin autoscaling): evita DoS por memoria. */
const MAX_BODY_BYTES = 256 * 1024;

type BodyResult = { ok: true; value: unknown } | { ok: false; code: number; error: string };

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return { ok: false, code: 413, error: "PAYLOAD_TOO_LARGE" };
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, code: 400, error: "INVALID_JSON" };
  }
}

async function handleHealth(provider: HealthProvider, res: ServerResponse): Promise<void> {
  try {
    const report = await provider();
    const isOk = report.status === "ok";
    sendJson(res, isOk ? 200 : 503, isOk ? report : { ...report, error: "COMPONENT_DOWN" });
  } catch {
    sendJson(res, 503, { status: "down", component: "mcp", error: "COMPONENT_DOWN" });
  }
}

async function handleMcp(
  deps: McpServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
  onError?: (error: unknown) => void,
): Promise<void> {
  const body = await readJsonBody(req);
  if (!body.ok) {
    sendJson(res, body.code, { error: body.error });
    return;
  }

  // Stateless: una instancia de server+transport por petición evita colisiones de IDs.
  const server = createMcpServer(deps);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    void transport.close();
    void server.close();
  };
  res.on("close", close);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body.value);
  } catch (error) {
    onError?.(error);
    if (!res.headersSent) sendJson(res, 500, { error: "MCP_ERROR" });
    close();
  }
}

export function createMcpHttpServer(options: McpHttpServerOptions): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && path === HEALTH_PATH) {
      void handleHealth(options.healthProvider, res);
      return;
    }
    if (req.method === "POST" && path === MCP_PATH) {
      void handleMcp(options.deps, req, res, options.onError);
      return;
    }
    sendJson(res, 404, { error: "NOT_FOUND" });
  });
}

export function startMcpHttpServer(options: McpHttpServerOptions): Promise<Server> {
  const server = createMcpHttpServer(options);
  return new Promise((resolve) => {
    server.listen({ port: options.port, host: options.host }, () => resolve(server));
  });
}
