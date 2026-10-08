import { NextResponse } from "next/server";
import { activeChain, contractAddress } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";
import { createLlmClient } from "@/lib/assistant/llm-provider";
import { sanitizeConversation } from "@/lib/assistant/pii-sanitizer";
import { McpToolGateway } from "@/lib/assistant/mcp-gateway";
import { createTxValidator } from "@/lib/assistant/chain-pricing";
import { runAssistant } from "@/lib/assistant/orchestrator";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import { redactPromptLeak } from "@/lib/assistant/prompt-leak-filter";
import { InMemoryRateLimiter, type RateLimiter } from "@/lib/assistant/rate-limit";
import type { ChatMessage } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";

const DEFAULT_MCP_URL = "http://127.0.0.1:8788/mcp";
const MAX_MESSAGES = 40;
/** Tope total de caracteres de la conversación enviada al LLM por petición (presupuesto duro). */
const MAX_TOTAL_CHARS = 24_000;
/** Respuesta neutra cuando el filtro anti-fuga redacta la salida (UX#30). */
const REDACTED_REPLY =
  "Solo puedo ayudarte con disponibilidad, precios y la compra de noches del hotel.";

/**
 * Limitador de peticiones COMPARTIDO entre invocaciones (MAJOR#8). En memoria del proceso: válido
 * para el despliegue SINGLE-INSTANCE del piloto. En multi-instancia hay que externalizar el estado
 * a un almacén compartido (Redis/Upstash) tras la misma interfaz {@link RateLimiter}.
 */
const rateLimiter: RateLimiter = new InMemoryRateLimiter();

/** Extrae la IP del cliente de las cabeceras del proxy (`x-forwarded-for` primero, luego `x-real-ip`). */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Respuesta 429 con `Retry-After`; no se llama al LLM (corta antes de incurrir en coste). */
const tooManyRequests = (retryAfterSeconds: number): NextResponse =>
  NextResponse.json(
    { error: "RATE_LIMITED" },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );

interface AssistantBody {
  readonly messages?: unknown;
  readonly walletAddress?: unknown;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** La dirección de wallet es pública; solo se usa como contexto read-only (getOwnedNights). */
function sanitizeWallet(input: unknown): string | undefined {
  return typeof input === "string" && ADDRESS_RE.test(input) ? input : undefined;
}

/**
 * Saneamiento estricto de la conversación entrante (no se confía en el cliente). Además del tope
 * de mensajes y de longitud por mensaje, aplica un presupuesto TOTAL de caracteres por petición
 * (MAJOR#8): acota el coste de tokens aunque cada mensaje individual esté dentro de su límite.
 */
function sanitizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  let totalChars = 0;
  for (const m of input) {
    const role = (m as ChatMessage)?.role;
    const text = (m as ChatMessage)?.text;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || text.length === 0) {
      return null;
    }
    const trimmed = text.slice(0, 4000);
    totalChars += trimmed.length;
    if (totalChars > MAX_TOTAL_CHARS) return null; // presupuesto de la conversación excedido.
    out.push({ role, text: trimmed });
  }
  return out;
}

/** Suma de caracteres de la conversación (entrada del presupuesto del limitador). */
function conversationChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.text.length, 0);
}

const unavailable = (reason: string): NextResponse => {
  // No se filtra el detalle al cliente; se registra en el servidor (08e → la UI ofrece manual).
  console.error("[assistant] no disponible:", reason);
  return NextResponse.json({ error: "ASSISTANT_UNAVAILABLE" }, { status: 503 });
};

/**
 * Orquestación del asistente IA server-side (RF-12, CU-08, docs/SRS.md §9). El LLM conversa con el
 * MCP por HTTP a través del puerto `LlmClient`; qué proveedor se usa lo decide `createLlmClient`
 * (v3: Vertex AI Gemini en `europe-west1`, sin secretos nuevos). Toda compra preparada se valida
 * server-side antes de devolverse. Cualquier fallo (configuración ausente, MCP/RPC caídos) → 503
 * para que la UI muestre `assistant-unavailable` y ofrezca la navegación manual (08e).
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Composición del LLM primero: si falta configuración se responde 503 sin gastar tokens.
  const llm = await createLlmClient(process.env);
  if (!llm.ok) return unavailable(llm.reason);

  let body: AssistantBody;
  try {
    body = (await request.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const messages = sanitizeMessages(body.messages);
  if (!messages) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // Rate limiting ANTES de llamar al LLM (MAJOR#8): corta el abuso de coste/DoS contra la API de
  // pago. Se acota por IP y, si hay wallet, también por wallet (la más restrictiva manda). El orden
  // IP→wallet es conservador: si la wallet falla tras pasar la IP, la IP ya contó esta petición
  // (limita un pelín más, nunca menos), lo que es seguro para el objetivo del control.
  const wallet = sanitizeWallet(body.walletAddress);
  const chars = conversationChars(messages);
  for (const key of [`ip:${clientIp(request)}`, ...(wallet ? [`wallet:${wallet}`] : [])]) {
    const decision = rateLimiter.check(key, chars);
    if (!decision.allowed) {
      console.warn("[assistant] rate limit:", decision.reason, key);
      return tooManyRequests(decision.retryAfterSeconds);
    }
  }

  const gateway = new McpToolGateway(new URL(process.env.MCP_BASE_URL ?? DEFAULT_MCP_URL), {
    sharedSecret: process.env.MCP_SHARED_SECRET,
  });
  try {
    const validatePreparedTx = createTxValidator(serverPublicClient(), {
      contractAddress,
      chainId: activeChain.id,
    });
    const system = buildSystemPrompt(new Date(), wallet);
    // RNF-27: el modelo es el único destinatario externo de texto libre del huésped, así que la PII
    // se enmascara justo aquí, en el punto de salida, y sobre TODO el historial (el proveedor recibe
    // la conversación completa en cada petición). Se registran solo las categorías, nunca el dato.
    const sanitized = sanitizeConversation(messages);
    if (sanitized.redactions.length > 0) {
      console.warn("[assistant] PII enmascarada:", sanitized.redactions.join(", "));
    }
    const result = await runAssistant(
      { llm: llm.client, gateway, validatePreparedTx, system },
      sanitized.messages,
    );
    // Red de seguridad anti-fuga del system prompt (UX#30): redacta una reproducción literal.
    return NextResponse.json({ ...result, reply: redactPromptLeak(result.reply, REDACTED_REPLY) });
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "error desconocido");
  } finally {
    await gateway.close().catch(() => undefined);
  }
}
