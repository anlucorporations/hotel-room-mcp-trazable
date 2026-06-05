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
  /**
   * Allowlist de Host header para la protección DNS-rebinding del transporte (MINOR#14).
   * Vacío/omitido ⇒ sin filtro (apto en loopback; con `0.0.0.0` configúrese o úsese reverse proxy).
   */
  readonly allowedHosts?: readonly string[];
  /** Allowlist de Origin header para la protección DNS-rebinding del transporte. */
  readonly allowedOrigins?: readonly string[];
}

const HEALTH_PATH = "/health";
const MCP_PATH = "/mcp";
/** Cota del cuerpo de `/mcp` (el MCP es un singleton sin autoscaling): evita DoS por memoria. */
const MAX_BODY_BYTES = 256 * 1024;

type BodyResult =
  | { ok: true; value: unknown }
  /** `aborted:true` ⇒ el stream del cuerpo erró/se cortó (cliente desconectado, reset, timeout). */
  | { ok: false; code: number; error: string; aborted?: boolean; cause?: unknown };

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Lee y parsea el cuerpo JSON de la petición con cota de tamaño. Toda lectura de stream puede
 * **errorar o abortar** (cliente que corta la conexión, timeout, reset): se captura en try/catch
 * para no dejar una promesa rechazada sin controlar que inestabilizaría el server (BLOCKER#2).
 * Distingue el abort/cierre (`aborted:true`, sin respuesta que enviar) del JSON inválido (400).
 */
async function readJsonBody(req: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) return { ok: false, code: 413, error: "PAYLOAD_TOO_LARGE" };
      chunks.push(chunk as Buffer);
    }
  } catch (error) {
    return { ok: false, code: 400, error: "REQUEST_STREAM_ERROR", aborted: true, cause: error };
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

/** Responde con un error JSON solo si el socket sigue escribible (evita lanzar sobre uno cerrado). */
function sendErrorIfWritable(res: ServerResponse, code: number, error: string): void {
  if (res.writableEnded || res.headersSent) return;
  sendJson(res, code, { error });
}

/** Contexto que necesita `handleMcp`: dependencias del server, seguridad del transporte y logging. */
interface McpRequestContext {
  readonly deps: McpServerDeps;
  readonly onError?: (error: unknown) => void;
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
}

/**
 * Construye las opciones del transporte Streamable (stateless) activando la protección
 * DNS-rebinding solo cuando hay alguna allowlist configurada (MINOR#14). Sin allowlist se mantiene
 * el comportamiento previo (apto en loopback / detrás de reverse proxy con allowlist de Origin).
 */
function transportOptions(ctx: McpRequestContext): ConstructorParameters<
  typeof StreamableHTTPServerTransport
>[0] {
  const allowedHosts = ctx.allowedHosts ?? [];
  const allowedOrigins = ctx.allowedOrigins ?? [];
  const enableDnsRebindingProtection = allowedHosts.length > 0 || allowedOrigins.length > 0;
  return {
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection,
    ...(allowedHosts.length > 0 ? { allowedHosts: [...allowedHosts] } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins: [...allowedOrigins] } : {}),
  };
}

async function handleMcp(ctx: McpRequestContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { deps, onError } = ctx;
  const body = await readJsonBody(req);
  if (!body.ok) {
    // Stream abortado/errado: registra y aborta silenciosamente si la conexión ya se cerró.
    if (body.aborted) {
      onError?.(body.cause);
      sendErrorIfWritable(res, body.code, body.error);
      return;
    }
    sendJson(res, body.code, { error: body.error });
    return;
  }

  // Stateless: una instancia de server+transport por petición evita colisiones de IDs.
  const server = createMcpServer(deps);
  const transport = new StreamableHTTPServerTransport(transportOptions(ctx));
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
  /** Red de seguridad última: ninguna promesa de los handlers debe quedar rechazada sin controlar. */
  const guard = (work: Promise<void>, res: ServerResponse): void => {
    void work.catch((error: unknown) => {
      options.onError?.(error);
      sendErrorIfWritable(res, 500, "MCP_ERROR");
    });
  };
  return createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && path === HEALTH_PATH) {
      guard(handleHealth(options.healthProvider, res), res);
      return;
    }
    if (req.method === "POST" && path === MCP_PATH) {
      const ctx: McpRequestContext = {
        deps: options.deps,
        onError: options.onError,
        allowedHosts: options.allowedHosts,
        allowedOrigins: options.allowedOrigins,
      };
      guard(handleMcp(ctx, req, res), res);
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
