import type { PurchaseTxData } from "@hotel/shared";
import type { LlmClient } from "./llm";
import type { ToolGateway } from "./tools-gateway";
import type { PreparedTxCheck } from "./validate-tx";
import type {
  AssistantResult,
  ChatMessage,
  PreparedPurchase,
  ToolResult,
  ToolUse,
  Turn,
} from "./types";

/** Validación server-side independiente de la tx (ADR-11); inyectada para poder testearla. */
export type ValidatePreparedTx = (tokenId: string, tx: PurchaseTxData) => Promise<PreparedTxCheck>;

export interface AssistantDeps {
  readonly llm: LlmClient;
  readonly gateway: ToolGateway;
  readonly validatePreparedTx: ValidatePreparedTx;
  /** Prompt de sistema ya compuesto (con contexto temporal); ver `buildSystemPrompt`. */
  readonly system: string;
  /** Tope de rondas de herramientas (anti-bucle). */
  readonly maxToolRounds?: number;
}

const BUILD_PURCHASE_TOOL = "buildPurchaseTx";
const DEFAULT_MAX_ROUNDS = 4;

/**
 * Orquesta la conversación del asistente (CU-08): ofrece al LLM las herramientas del MCP,
 * ejecuta las que pida y le devuelve los resultados, hasta que responde sin más herramientas.
 *
 * Guardrails: el alcance lo fija el prompt (rechazo fuera de dominio, no exponer instrucciones)
 * y, estructuralmente, el conjunto de herramientas (solo lectura + `buildPurchaseTx`, sin firma).
 * Toda compra preparada se **valida server-side** de forma independiente antes de ofrecerse.
 */
export async function runAssistant(
  deps: AssistantDeps,
  messages: readonly ChatMessage[],
): Promise<AssistantResult> {
  const tools = await deps.gateway.listTools();
  const turns: Turn[] = messages.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", text: m.text, toolUses: [] }
      : { role: "user", text: m.text },
  );
  const maxRounds = deps.maxToolRounds ?? DEFAULT_MAX_ROUNDS;

  let domainToolCalls = 0;
  let preparedPurchase: PreparedPurchase | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const res = await deps.llm.createMessage({ system: deps.system, turns, tools });
    if (res.toolUses.length === 0) {
      return { reply: res.text, domainToolCalls, preparedPurchase };
    }

    turns.push({ role: "assistant", text: res.text, toolUses: res.toolUses });
    const results: ToolResult[] = [];
    for (const toolUse of res.toolUses) {
      domainToolCalls++;
      const outcome = await dispatchTool(deps, toolUse);
      results.push(outcome.result);
      if (toolUse.name === BUILD_PURCHASE_TOOL) {
        preparedPurchase = outcome.preparedPurchase ?? null; // null si no validó.
      }
    }
    turns.push({ role: "user", toolResults: results });
  }

  // Excedió el tope de rondas: cierre forzado sin más herramientas.
  const closing = await deps.llm.createMessage({ system: deps.system, turns, tools: [] });
  return { reply: closing.text, domainToolCalls, preparedPurchase };
}

async function dispatchTool(
  deps: AssistantDeps,
  toolUse: ToolUse,
): Promise<{ result: ToolResult; preparedPurchase?: PreparedPurchase }> {
  try {
    const raw = await deps.gateway.callTool(toolUse.name, toolUse.input);

    if (toolUse.name === BUILD_PURCHASE_TOOL) {
      const tx = raw as PurchaseTxData;
      const tokenId = String(toolUse.input.tokenId);
      const check = await deps.validatePreparedTx(tokenId, tx);
      if (!check.ok) {
        return {
          result: toolError(toolUse.id, { error: "VALIDATION_FAILED", reasons: check.reasons }),
        };
      }
      return {
        result: { toolUseId: toolUse.id, content: JSON.stringify(tx) },
        preparedPurchase: { tokenId, tx },
      };
    }

    return { result: { toolUseId: toolUse.id, content: JSON.stringify(raw) } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: toolError(toolUse.id, { error: message }) };
  }
}

const toolError = (toolUseId: string, payload: unknown): ToolResult => ({
  toolUseId,
  content: JSON.stringify(payload),
  isError: true,
});
