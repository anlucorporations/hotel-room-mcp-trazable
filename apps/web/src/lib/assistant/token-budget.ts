import type { ChatMessage } from "./types";

/**
 * Presupuesto de tokens del asistente (RNF-24).
 *
 * El coste del asistente es proporcional a los tokens que viajan en **cada** llamada, y la
 * conversación completa se reenvía en cada turno. Aquí se acota antes de salir al proveedor:
 * ventana deslizante de turnos recientes y un techo de entrada/salida.
 *
 * La estimación es deliberadamente **conservadora** (sobreestima): un presupuesto que se queda corto
 * protege el coste; uno que se queda largo lo desborda. No se usa el contador del proveedor para no
 * añadir una llamada de red por petición.
 */

/** Tokens de entrada permitidos por petición (RNF-24). */
export const DEFAULT_MAX_INPUT_TOKENS = 6_000;
/** Tokens de salida por respuesta (RNF-24); el adaptador lo aplica como `maxOutputTokens`. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 512;
/** Turnos de conversación que se conservan (los más recientes). */
export const DEFAULT_MAX_TURNS = 12;

/**
 * Caracteres por token. En español son ~3,5-4; se toma el valor bajo para **sobreestimar** los tokens
 * (el prompt de sistema, los esquemas de herramientas y el JSON son más densos que la prosa).
 */
const CHARS_PER_TOKEN = 3.5;

/** Estimación de tokens de un texto. `0` para cadena vacía. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface InputBudgetOptions {
  readonly system: string;
  /** Esquemas de herramientas ya serializados: viajan en cada llamada. */
  readonly toolSchemas: string;
  readonly messages: readonly ChatMessage[];
  readonly maxInputTokens?: number;
  readonly maxTurns?: number;
}

export interface InputBudgetResult {
  /** Turnos que se enviarán (los más recientes que caben). */
  readonly messages: readonly ChatMessage[];
  /** Turnos descartados por la ventana deslizante o por el techo de tokens. */
  readonly droppedTurns: number;
  /** Estimación de tokens de entrada de la petición resultante. */
  readonly estimatedInputTokens: number;
  /** `false` si ni con el último turno se cabe: el llamante debe rechazar o truncar. */
  readonly withinBudget: boolean;
}

/**
 * Aplica el presupuesto de entrada: conserva los turnos más recientes y descarta los antiguos hasta
 * caber. Nunca recorta un mensaje a la mitad —un turno truncado produce respuestas incoherentes—,
 * salvo que sea el último y venga de fuera del presupuesto, en cuyo caso se marca `withinBudget`.
 */
export function applyInputBudget(options: InputBudgetOptions): InputBudgetResult {
  const maxInputTokens = options.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const fixed = estimateTokens(options.system) + estimateTokens(options.toolSchemas);

  const recent = options.messages.slice(-maxTurns);
  const droppedByWindow = options.messages.length - recent.length;

  const kept: ChatMessage[] = [];
  let used = fixed;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i]!;
    const cost = estimateTokens(message.text);
    if (used + cost > maxInputTokens) break;
    kept.unshift(message);
    used += cost;
  }

  return {
    messages: kept,
    droppedTurns: droppedByWindow + (recent.length - kept.length),
    estimatedInputTokens: used,
    withinBudget: kept.length > 0 && used <= maxInputTokens,
  };
}
