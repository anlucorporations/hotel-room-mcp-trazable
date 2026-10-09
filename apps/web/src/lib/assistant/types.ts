import type { PurchaseTxData } from "@hotel/shared/domain";
import type { AssistantToolCall } from "./page-action";

/**
 * Tipos neutrales del asistente (RF-12, CU-08, docs/SRS.md §9). No dependen del proveedor LLM ni del MCP:
 * los adaptadores (Anthropic, MCP) los traducen. Así el orquestador y sus guardrails se
 * prueban de forma determinista con dobles (harness de replay, ADR-23).
 */

/** Bloque de uso de herramienta emitido por el LLM. */
export interface ToolUse {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** Resultado de una herramienta devuelto al LLM. */
export interface ToolResult {
  readonly toolUseId: string;
  readonly content: string;
  readonly isError?: boolean;
}

export interface AssistantTurn {
  readonly role: "assistant";
  readonly text: string;
  readonly toolUses: readonly ToolUse[];
}

export interface UserTurn {
  readonly role: "user";
  readonly text?: string;
  readonly toolResults?: readonly ToolResult[];
}

export type Turn = AssistantTurn | UserTurn;

/** Descriptor de una herramienta del MCP para ofrecérsela al LLM. */
export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  /** JSON Schema de la entrada (tal cual lo expone el MCP). */
  readonly inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  readonly system: string;
  readonly turns: readonly Turn[];
  readonly tools: readonly ToolDescriptor[];
}

/**
 * Consumo de tokens de una llamada al modelo. Opcional en el puerto para no romper los dobles de
 * test (el arnés de replay de ADR-23 no siempre informa de consumo).
 */
export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Tokens de entrada servidos desde la caché del proveedor (0 si no aplica). */
  readonly cachedInputTokens: number;
}

export interface LlmResponse {
  readonly text: string;
  readonly toolUses: readonly ToolUse[];
  readonly usage?: LlmUsage;
}

/** Mensaje de la conversación tal como llega de la UI. */
export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** Tx de compra preparada y **validada server-side** lista para que el usuario firme. */
export interface PreparedPurchase {
  readonly tokenId: string;
  readonly tx: PurchaseTxData;
}

export interface AssistantResult {
  readonly reply: string;
  /** Nº de llamadas a herramientas de dominio (0 en peticiones fuera de dominio, CU-08 08b). */
  readonly domainToolCalls: number;
  /** Compra preparada y verificada, o `null` si no procede / no validó. */
  readonly preparedPurchase: PreparedPurchase | null;
  /** Nº de llamadas al modelo (rondas de herramientas más el cierre). */
  readonly llmCalls: number;
  /** Consumo de tokens sumado de todas las llamadas de la petición (RNF-24). */
  readonly usage: LlmUsage;
  /** Turnos descartados por el presupuesto de entrada (RNF-24). */
  readonly droppedTurns: number;
  /**
   * Herramientas de dominio que respondieron **con éxito**, en orden de ejecución. Es la materia
   * prima de la acción de página (`derivePageAction`): una herramienta que falló no mueve al usuario.
   */
  readonly toolCalls: readonly AssistantToolCall[];
}
