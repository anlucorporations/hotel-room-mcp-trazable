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
 * Toda compra preparada se valida server-side contra el **precio on-chain** + `to`/`chainId` antes
 * de ofrecerse; la garantía frente a «noche equivocada» NO es el tokenId (que afirma el LLM) sino
 * el precio on-chain + el contrato + la revisión del usuario en el handoff (MINOR#20/#25).
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
      // `tokenId` proviene de `toolUse.input`, es decir, de lo que AFIRMA el LLM (MINOR#25). Por eso
      // el contraste tokenId-del-calldata == tokenId-afirmado es tautológico y NO detecta «el
      // asistente preparó la noche equivocada». La defensa REAL que aplica `validatePreparedTx` es
      // el **precio on-chain** (`value == priceOf`/`listingOf.price`) + `to`/`chainId` + el propio
      // contrato; y la última línea es la **revisión del usuario** en el panel del handoff.
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
