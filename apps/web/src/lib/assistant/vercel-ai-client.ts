import {
  generateText,
  jsonSchema,
  tool,
  type AssistantContent,
  type JSONSchema7,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { LlmClient } from "./llm";
import type { LlmRequest, LlmResponse, ToolDescriptor, Turn } from "./types";

/**
 * Adaptador del puerto {@link LlmClient} sobre el **Vercel AI SDK** (`generateText` + `tools`),
 * incorporado en el hito H1 de la v3 (`RepoTecnico/propuesta_v3_asistente_ia.md`).
 *
 * Dos decisiones deliberadas:
 *
 * 1. **Las herramientas se declaran SIN `execute`.** El SDK devuelve los `toolCalls` sin ejecutar
 *    nada, y el orquestador ya probado (`orchestrator.ts`) sigue siendo quien las ejecuta y quien
 *    valida la transacción contra el precio on-chain. El SDK es un adaptador de modelo, **no** un
 *    segundo orquestador: los guardrails existentes no se tocan.
 * 2. **El modelo se inyecta** (`LanguageModel`) en lugar de construirse aquí. La composición
 *    (Vertex en producción, el doble de test en las pruebas) vive en `llm-provider.ts`; así este
 *    adaptador es determinista y no abre ninguna conexión por sí mismo.
 */
export interface VercelAiLlmClientOptions {
  readonly model: LanguageModel;
  /** Tope de tokens de salida (palanca de coste, RNF-24). */
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

/** Nombre de reserva si un resultado llegara sin su llamada previa (no debería ocurrir). */
const UNKNOWN_TOOL_NAME = "unknown";

const DEFAULT_MAX_OUTPUT_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.2;
/** Un solo reintento: la latencia del camino crítico importa más que la resiliencia aquí (RNF-25). */
const MAX_RETRIES = 1;

export class VercelAiLlmClient implements LlmClient {
  private readonly model: LanguageModel;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;

  constructor(options: VercelAiLlmClientOptions) {
    this.model = options.model;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  }

  async createMessage(request: LlmRequest): Promise<LlmResponse> {
    const result = await generateText({
      model: this.model,
      system: request.system,
      messages: toModelMessages(request.turns),
      tools: toToolSet(request.tools),
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
      maxRetries: MAX_RETRIES,
    });

    return {
      text: result.text,
      toolUses: result.toolCalls.map((call) => ({
        id: call.toolCallId,
        name: call.toolName,
        input: normalizeToolInput(call.input),
      })),
    };
  }
}

/**
 * Normaliza la entrada de una herramienta a objeto JSON.
 *
 * La especificación de modelo del SDK admite **dos** representaciones del mismo dato
 * (`LanguageModelV4ToolCallPart.input: unknown` ya parseado y `LanguageModelV4ToolCall.input:
 * string` en crudo), y de qué variante use el proveedor depende del adaptador de cada modelo. El
 * MCP, en cambio, exige un objeto. Normalizar aquí evita que un `JSON.stringify` se cuele hasta
 * `callTool` como si fuera el argumento.
 */
export function normalizeToolInput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isPlainObject(raw) ? raw : {};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Traduce las herramientas del MCP (JSON Schema) al `ToolSet` del SDK, **sin `execute`**: si el
 * modelo las pide, el SDK las devuelve y no las ejecuta.
 */
export function toToolSet(tools: readonly ToolDescriptor[]): ToolSet {
  const set: ToolSet = {};
  for (const descriptor of tools) {
    set[descriptor.name] = tool({
      description: descriptor.description,
      inputSchema: jsonSchema(descriptor.inputSchema as JSONSchema7),
    });
  }
  return set;
}

/**
 * Traduce los turnos neutrales del orquestador a mensajes del SDK.
 *
 * El `ToolResult` del orquestador solo lleva `toolUseId` (no el nombre de la herramienta), mientras
 * que el SDK exige `toolName` en el mensaje de resultado. Por eso el nombre se reconstruye
 * recorriendo los turnos en orden: el turno del asistente que pidió la herramienta **siempre**
 * precede al turno que trae sus resultados (así los construye `orchestrator.ts`).
 */
export function toModelMessages(turns: readonly Turn[]): ModelMessage[] {
  const toolNamesByCallId = new Map<string, string>();
  const messages: ModelMessage[] = [];

  for (const turn of turns) {
    if (turn.role === "assistant") {
      const content: AssistantContent = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const use of turn.toolUses) {
        toolNamesByCallId.set(use.id, use.name);
        content.push({ type: "tool-call", toolCallId: use.id, toolName: use.name, input: use.input });
      }
      if (content.length > 0) messages.push({ role: "assistant", content });
      continue;
    }

    if (turn.toolResults && turn.toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: turn.toolResults.map((result) => ({
          type: "tool-result",
          toolCallId: result.toolUseId,
          toolName: toolNamesByCallId.get(result.toolUseId) ?? UNKNOWN_TOOL_NAME,
          output: result.isError
            ? { type: "error-text", value: result.content }
            : { type: "text", value: result.content },
        })),
      });
      continue;
    }

    messages.push({ role: "user", content: turn.text ?? "" });
  }

  return messages;
}
