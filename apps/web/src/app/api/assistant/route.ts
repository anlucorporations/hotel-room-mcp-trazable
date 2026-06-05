import { NextResponse } from "next/server";
import { activeChain, contractAddress } from "@/config/chain";
import { serverPublicClient } from "@/lib/server-client";
import { AnthropicLlmClient } from "@/lib/assistant/anthropic-client";
import { McpToolGateway } from "@/lib/assistant/mcp-gateway";
import { createTxValidator } from "@/lib/assistant/chain-pricing";
import { runAssistant } from "@/lib/assistant/orchestrator";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import type { ChatMessage } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";

const DEFAULT_MCP_URL = "http://127.0.0.1:8788/mcp";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_MESSAGES = 40;

interface AssistantBody {
  readonly messages?: unknown;
}

/** Saneamiento estricto de la conversación entrante (no se confía en el cliente). */
function sanitizeMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of input) {
    const role = (m as ChatMessage)?.role;
    const text = (m as ChatMessage)?.text;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || text.length === 0) {
      return null;
    }
    out.push({ role, text: text.slice(0, 4000) });
  }
  return out;
}

const unavailable = (reason: string): NextResponse => {
  // No se filtra el detalle al cliente; se registra en el servidor (08e → la UI ofrece manual).
  console.error("[assistant] no disponible:", reason);
  return NextResponse.json({ error: "ASSISTANT_UNAVAILABLE" }, { status: 503 });
};

/**
 * Orquestación del asistente IA server-side (RF-12, CU-08). El LLM (Anthropic) conversa con el
 * MCP por HTTP; el secreto `ANTHROPIC_API_KEY` solo vive aquí. Toda compra preparada se valida
 * server-side antes de devolverse. Cualquier fallo (sin clave, MCP/RPC caídos) → 503 para que
 * la UI muestre `assistant-unavailable` y ofrezca la navegación manual (08e).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return unavailable("falta ANTHROPIC_API_KEY");

  let body: AssistantBody;
  try {
    body = (await request.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const messages = sanitizeMessages(body.messages);
  if (!messages) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const gateway = new McpToolGateway(new URL(process.env.MCP_BASE_URL ?? DEFAULT_MCP_URL));
  try {
    const llm = new AnthropicLlmClient({ apiKey, model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL });
    const validatePreparedTx = createTxValidator(serverPublicClient(), {
      contractAddress,
      chainId: activeChain.id,
    });
    const system = buildSystemPrompt(new Date());
    const result = await runAssistant({ llm, gateway, validatePreparedTx, system }, messages);
    return NextResponse.json(result);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "error desconocido");
  } finally {
    await gateway.close().catch(() => undefined);
  }
}
