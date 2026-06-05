import type { LlmRequest, LlmResponse } from "./types";

/**
 * Puerto del LLM (DIP). El orquestador depende de esta abstracción, no de Anthropic: en tests
 * se inyecta un doble de replay determinista; en producción, `AnthropicLlmClient`.
 */
export interface LlmClient {
  createMessage(request: LlmRequest): Promise<LlmResponse>;
}
