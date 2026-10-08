import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "./llm";
import type { LlmRequest, LlmResponse, ToolUse, Turn } from "./types";

/**
 * Adaptador del puerto {@link LlmClient} sobre la API de Anthropic (server-side, RF-12). La
 * clave (`ANTHROPIC_API_KEY`) solo vive aquí, en el servidor. Traduce los tipos neutrales del
 * orquestador al formato de mensajes/herramientas de Anthropic y de vuelta.
 */
export interface AnthropicLlmClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(options: AnthropicLlmClientOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async createMessage(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: request.system,
      messages: request.turns.map(toAnthropicMessage),
      tools: request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    let text = "";
    const toolUses: ToolUse[] = [];
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }
    return {
      text,
      toolUses,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens: response.usage?.cache_read_input_tokens ?? 0,
      },
    };
  }
}

function toAnthropicMessage(turn: Turn): Anthropic.MessageParam {
  if (turn.role === "assistant") {
    const content: Anthropic.ContentBlockParam[] = [];
    if (turn.text) content.push({ type: "text", text: turn.text });
    for (const tu of turn.toolUses) {
      content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
    }
    return { role: "assistant", content };
  }
  if (turn.toolResults?.length) {
    return {
      role: "user",
      content: turn.toolResults.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.toolUseId,
        content: r.content,
        is_error: r.isError ?? false,
      })),
    };
  }
  return { role: "user", content: turn.text ?? "" };
}
