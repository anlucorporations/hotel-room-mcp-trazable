import { formatEther } from "viem";
import type { PurchaseTxData } from "@hotel/shared/domain";
import type { LlmClient } from "./llm";
import type { ToolGateway } from "./tools-gateway";
import type { PreparedTxCheck } from "./validate-tx";
import { addUsage, EMPTY_USAGE } from "./metrics";
import { isUnusableText } from "./vercel-ai-client";
import { DEFAULT_MAX_INPUT_TOKENS, DEFAULT_MAX_TURNS, applyInputBudget } from "./token-budget";
import type {
  AssistantResult,
  ChatMessage,
  LlmUsage,
  PreparedPurchase,
  ToolResult,
  ToolUse,
  Turn,
} from "./types";
import type { AssistantToolCall } from "./page-action";
import { highlightsFromToolResult, mergeHighlights, type NightHighlight } from "./highlights";
import { mergePreparedPurchases, stayPurchasesFrom } from "./stay";

/** Validación server-side independiente de la tx (ADR-11); inyectada para poder testearla. */
export type ValidatePreparedTx = (tokenId: string, tx: PurchaseTxData) => Promise<PreparedTxCheck>;

export interface AssistantDeps {
  readonly llm: LlmClient;
  readonly gateway: ToolGateway;
  readonly validatePreparedTx: ValidatePreparedTx;
  /** Prompt de sistema ya compuesto (con contexto temporal); ver `buildSystemPrompt`. */
  readonly system: string;
  /** Tope de rondas de herramientas (anti-bucle y palanca de coste: cada ronda se factura). */
  readonly maxToolRounds?: number;
  /** Presupuesto de entrada (RNF-24). Se aplica DESPUÉS de conocer los esquemas de herramientas. */
  readonly maxInputTokens?: number;
  readonly maxTurns?: number;
}

const BUILD_PURCHASE_TOOL = "buildPurchaseTx";
/** Estancia de varias noches (petición del responsable, 2026-10-13): una tx por noche. */
const PREPARE_STAY_TOOL = "prepareStayTx";
const DEFAULT_MAX_ROUNDS = 2;

/**
 * Mensaje de reserva cuando el proveedor no devuelve texto ni siquiera tras el reintento del
 * adaptador (medido en H4: ~5 % de las respuestas). El usuario nunca debe recibir una burbuja vacía.
 */
const EMPTY_REPLY_FALLBACK =
  "No he podido completar la respuesta. ¿Puedes reformular la pregunta?";

/**
 * Orquesta la conversación del asistente (CU-08, docs/SRS.md §9): ofrece al LLM las herramientas del MCP,
 * ejecuta las que pida y le devuelve los resultados, hasta que responde sin más herramientas.
 *
 * Guardrails: el alcance lo fija el prompt (rechazo fuera de dominio, no exponer instrucciones)
 * y, estructuralmente, el conjunto de herramientas (solo lectura + `buildPurchaseTx`, sin firma).
 * Toda compra preparada se valida server-side contra el **precio on-chain** + `to`/`chainId` antes
 * de ofrecerse; la garantía frente a «noche equivocada» NO es el tokenId (que afirma el LLM) sino
 * el precio on-chain + el contrato + la revisión del usuario en el handoff (MINOR#20/#25).
 */
/** `AAAAMMDD` → `dd/mm/aaaa` (o `null` si no tiene forma de fecha). */
function formatNightDate(dateYYYYMMDD: number | null): string | null {
  if (dateYYYYMMDD === null) return null;
  const raw = String(dateYYYYMMDD);
  if (raw.length !== 8) return null;
  return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}`;
}

/** Precio `wei` → `0,05 ETH` (o `null` si no es convertible). */
function formatPriceEth(priceWei: string | null): string | null {
  if (priceWei === null) return null;
  try {
    return `${formatEther(BigInt(priceWei))} ETH`;
  } catch {
    return null;
  }
}

/**
 * **Apoyo determinista** cuando el proveedor devuelve texto inservible.
 *
 * El fallback genérico («reformula la pregunta») es honesto pero inútil: si el turno ya consultó el
 * catálogo o preparó compras, el usuario tiene delante la información real y solo necesita saber qué
 * hacer. Se compone una respuesta con **datos que ya devolvieron las herramientas** (nunca inventados):
 *   1. compras preparadas → «revísalas y fírmalas»;
 *   2. noches encontradas → lista con habitación, tipo, fecha y precio en ETH;
 *   3. si no hay nada, `null` y se usa el mensaje genérico.
 */
function deterministicSupportReply(
  preparedPurchases: readonly PreparedPurchase[],
  highlights: readonly NightHighlight[],
): string | null {
  if (preparedPurchases.length > 0) {
    const count = preparedPurchases.length;
    return count === 1
      ? "He preparado la compra de la noche. Revísala y fírmala en tu cartera para completar la reserva."
      : `He preparado las compras de ${count} noches. Revísalas y fírmalas en tu cartera para completar la reserva.`;
  }
  if (highlights.length === 0) return null;
  const lines = highlights.slice(0, 5).map((highlight) => {
    const parts: string[] = [];
    if (highlight.room !== null) parts.push(`Habitación ${highlight.room}`);
    if (highlight.type !== null) parts.push(highlight.type);
    const date = formatNightDate(highlight.dateYYYYMMDD);
    if (date !== null) parts.push(`del ${date}`);
    const price = formatPriceEth(highlight.priceWei);
    const head = parts.join(" ");
    return `- ${head}${price !== null ? ` por ${price}` : ""}`;
  });
  return `Estas son las noches que he encontrado:\n${lines.join("\n")}\nPuedes preparar la reserva desde la tarjeta de cada noche.`;
}

/** Garantiza que el usuario recibe algo legible: ni vacío ni una pseudollamada en texto. */
function replyOrFallback(
  text: string,
  preparedPurchases: readonly PreparedPurchase[] = [],
  highlights: readonly NightHighlight[] = [],
): string {
  if (!isUnusableText(text)) return text;
  return deterministicSupportReply(preparedPurchases, highlights) ?? EMPTY_REPLY_FALLBACK;
}

export async function runAssistant(
  deps: AssistantDeps,
  messages: readonly ChatMessage[],
): Promise<AssistantResult> {
  const tools = await deps.gateway.listTools();

  // El presupuesto se aplica aquí, y no en la ruta, porque los esquemas de las herramientas (que
  // viajan en CADA llamada) solo se conocen después de descubrirlas en el MCP.
  const budget = applyInputBudget({
    system: deps.system,
    toolSchemas: JSON.stringify(tools),
    messages,
    maxInputTokens: deps.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
    maxTurns: deps.maxTurns ?? DEFAULT_MAX_TURNS,
  });

  const turns: Turn[] = budget.messages.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", text: m.text, toolUses: [] }
      : { role: "user", text: m.text },
  );
  const maxRounds = deps.maxToolRounds ?? DEFAULT_MAX_ROUNDS;

  let domainToolCalls = 0;
  let preparedPurchases: PreparedPurchase[] = [];
  // Herramientas que respondieron con éxito (incremento v4): base determinista de la acción de
  // página. Se registra la ENTRADA real, no la prosa del modelo, así que el filtro del catálogo no
  // se puede manipular desde el prompt.
  const toolCalls: AssistantToolCall[] = [];
  // Noches ofrecidas en el turno (formato amigable para su compra): se derivan de los
  // resultados REALES del catálogo, no de la prosa del modelo.
  let highlights: NightHighlight[] = [];
  // Consumo agregado de la petición (RNF-24): cada ronda de herramientas es una llamada facturable.
  let usage: LlmUsage = EMPTY_USAGE;
  let llmCalls = 0;

  for (let round = 0; round < maxRounds; round++) {
    const res = await deps.llm.createMessage({ system: deps.system, turns, tools });
    llmCalls += 1;
    usage = addUsage(usage, res.usage ?? EMPTY_USAGE);
    if (res.toolUses.length === 0) {
      return {
        reply: replyOrFallback(res.text, preparedPurchases, highlights),
        domainToolCalls,
        preparedPurchase: preparedPurchases[0] ?? null,
        preparedPurchases,
        llmCalls,
        usage,
        droppedTurns: budget.droppedTurns,
        toolCalls,
        highlights,
      };
    }

    turns.push({ role: "assistant", text: res.text, toolUses: res.toolUses });
    const results: ToolResult[] = [];
    for (const toolUse of res.toolUses) {
      domainToolCalls++;
      const outcome = await dispatchTool(deps, toolUse);
      results.push(outcome.result);
      // Solo las herramientas que respondieron bien pueden mover la pantalla (una consulta fallida
      // no debe llevar al catálogo con un filtro que nadie ha podido resolver).
      if (!outcome.result.isError) {
        toolCalls.push({ name: toolUse.name, input: toolUse.input });
        highlights = mergeHighlights(
          highlights,
          highlightsFromToolResult(toolUse.name, parseToolContent(outcome.result.content)),
        );
      }
      // Compras preparadas: una noche (`buildPurchaseTx`) o la estancia entera (`prepareStayTx`).
      // Se acumulan sin repetir tokenId, así que varias herramientas del turno componen una reserva
      // de varias noches sin pisarse.
      if (outcome.prepared && outcome.prepared.length > 0) {
        preparedPurchases = mergePreparedPurchases(preparedPurchases, outcome.prepared);
      }
    }
    turns.push({ role: "user", toolResults: results });
  }

  // Excedió el tope de rondas: cierre forzado sin más herramientas.
  const closing = await deps.llm.createMessage({ system: deps.system, turns, tools: [] });
  llmCalls += 1;
  usage = addUsage(usage, closing.usage ?? EMPTY_USAGE);
  return {
    reply: replyOrFallback(closing.text, preparedPurchases, highlights),
    domainToolCalls,
    preparedPurchase: preparedPurchases[0] ?? null,
    preparedPurchases,
    llmCalls,
    usage,
    droppedTurns: budget.droppedTurns,
    toolCalls,
    highlights,
  };
}

async function dispatchTool(
  deps: AssistantDeps,
  toolUse: ToolUse,
): Promise<{ result: ToolResult; prepared?: PreparedPurchase[] }> {
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
        prepared: [{ tokenId, tx }],
      };
    }

    if (toolUse.name === PREPARE_STAY_TOOL) {
      // Estancia de varias noches: **cada** tx se valida antes de ofrecerse y el conjunto es todo o
      // nada. Si una noche no cuadra, no se devuelve ninguna: el usuario no debe firmar una estancia
      // a la que le falta una noche sin saberlo (mismo guardrail que la compra de una noche).
      const purchases = stayPurchasesFrom(raw);
      if (purchases.length === 0) {
        return {
          result: toolError(toolUse.id, { error: "VALIDATION_FAILED", reasons: ["plan de estancia vacío o mal formado"] }),
        };
      }
      for (const purchase of purchases) {
        const check = await deps.validatePreparedTx(purchase.tokenId, purchase.tx);
        if (!check.ok) {
          return {
            result: toolError(toolUse.id, { error: "VALIDATION_FAILED", reasons: check.reasons }),
          };
        }
      }
      return { result: { toolUseId: toolUse.id, content: JSON.stringify(raw) }, prepared: purchases };
    }

    return { result: { toolUseId: toolUse.id, content: JSON.stringify(raw) } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: toolError(toolUse.id, { error: message }) };
  }
}

/**
 * Contenido de una herramienta como objeto. El MCP devuelve texto JSON; si viniera corrupto (o no
 * fuera JSON), se ignora en silencio: las tarjetas de noches son un extra, nunca un motivo para
 * tumbar el turno.
 */
function parseToolContent(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

const toolError = (toolUseId: string, payload: unknown): ToolResult => ({
  toolUseId,
  content: JSON.stringify(payload),
  isError: true,
});
