import type { PurchaseTxData } from "@hotel/shared";

/**
 * Tipos neutrales del asistente (RF-12, CU-08). No dependen del proveedor LLM ni del MCP:
 * los adaptadores (Anthropic, MCP) los traducen. Así el orquestador y sus guardrails se
 * prueban de forma determinista con dobles (harness de replay, DISEÑO §test).
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

export interface LlmResponse {
  readonly text: string;
  readonly toolUses: readonly ToolUse[];
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
}
