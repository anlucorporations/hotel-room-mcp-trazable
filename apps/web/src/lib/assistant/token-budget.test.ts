import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_MAX_TURNS,
  applyInputBudget,
  estimateTokens,
} from "./token-budget";
import type { ChatMessage } from "./types";

/** `n` caracteres: con la ratio conservadora (3,5) son ~n/3,5 tokens. */
const text = (chars: number): string => "x".repeat(chars);
const user = (chars: number): ChatMessage => ({ role: "user", text: text(chars) });

describe("estimateTokens", () => {
  it("estima por caracteres con una ratio conservadora", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(35))).toBe(10);
    // Sobrestima a propósito: 100 caracteres de español son ~28 tokens, no 100.
    expect(estimateTokens("a".repeat(100))).toBeGreaterThan(25);
  });

  it("los valores por defecto respetan el techo de RNF-24", () => {
    expect(DEFAULT_MAX_INPUT_TOKENS).toBe(6_000);
    expect(DEFAULT_MAX_TURNS).toBe(12);
  });
});

describe("applyInputBudget", () => {
  it("no toca una conversación que cabe", () => {
    const messages = [user(70), user(70)];
    const budget = applyInputBudget({ system: text(35), toolSchemas: "", messages });

    expect(budget.messages).toHaveLength(2);
    expect(budget.droppedTurns).toBe(0);
    expect(budget.withinBudget).toBe(true);
  });

  it("cuenta el prompt de sistema y los esquemas de herramientas en el presupuesto", () => {
    const messages = [user(70)];
    const sinEsquemas = applyInputBudget({ system: "", toolSchemas: "", messages, maxInputTokens: 30 });
    const conEsquemas = applyInputBudget({
      system: text(35),
      toolSchemas: text(35),
      messages,
      maxInputTokens: 30,
    });

    expect(sinEsquemas.withinBudget).toBe(true);
    expect(conEsquemas.withinBudget).toBe(false); // sistema + esquemas ya agotan el techo
  });

  it("descarta los turnos más antiguos y conserva los recientes", () => {
    const messages = [user(700), user(700), user(700)];
    // 700 caracteres ≈ 200 tokens por turno; el techo deja entrar dos.
    const budget = applyInputBudget({ system: "", toolSchemas: "", messages, maxInputTokens: 450 });

    expect(budget.messages).toHaveLength(2);
    expect(budget.droppedTurns).toBe(1);
    expect(budget.messages[0]).toBe(messages[1]);
    expect(budget.messages[1]).toBe(messages[2]);
  });

  it("aplica la ventana de turnos aunque sobre presupuesto", () => {
    const messages = Array.from({ length: 20 }, () => user(7));
    const budget = applyInputBudget({ system: "", toolSchemas: "", messages, maxTurns: 5 });

    expect(budget.messages).toHaveLength(5);
    expect(budget.droppedTurns).toBe(15);
  });

  it("marca fuera de presupuesto cuando ni el último turno cabe", () => {
    const budget = applyInputBudget({
      system: "",
      toolSchemas: "",
      messages: [user(3_500)],
      maxInputTokens: 100,
    });

    expect(budget.messages).toEqual([]);
    expect(budget.withinBudget).toBe(false);
    expect(budget.droppedTurns).toBe(1);
  });

  it("un turno que cabe entra ENTERO, sin recortarlo", () => {
    const messages = [user(3_500)];
    const budget = applyInputBudget({ system: "", toolSchemas: "", messages, maxInputTokens: 1_200 });

    expect(budget.messages[0]?.text).toBe(messages[0]?.text);
    expect(budget.withinBudget).toBe(true);
  });

  it("un turno que no cabe se descarta entero (nunca se envía truncado)", () => {
    const messages = [user(3_500)];
    const budget = applyInputBudget({ system: "", toolSchemas: "", messages, maxInputTokens: 900 });

    // O entra entero, o no entra: jamás un turno a medias, que produciría respuestas incoherentes.
    expect(budget.messages).toEqual([]);
    expect(budget.withinBudget).toBe(false);
  });
});
