import { describe, expect, it } from "vitest";
import {
  EMPTY_USAGE,
  MonthlyBudget,
  addUsage,
  budgetConfig,
  estimateCostUsd,
  metricsLogLine,
  type AssistantMetrics,
} from "./metrics";

const METRICS: AssistantMetrics = {
  provider: "vertex",
  model: "gemini-2.5-flash-lite",
  latencyMs: 1_234,
  llmCalls: 2,
  toolCalls: 1,
  usage: { inputTokens: 3_000, outputTokens: 400, cachedInputTokens: 0 },
  costUsd: 0.00046,
  redactions: ["correo"],
  droppedTurns: 0,
};

describe("addUsage", () => {
  it("suma las rondas de una misma petición", () => {
    expect(
      addUsage({ inputTokens: 10, outputTokens: 2, cachedInputTokens: 1 }, {
        inputTokens: 5,
        outputTokens: 3,
        cachedInputTokens: 4,
      }),
    ).toEqual({ inputTokens: 15, outputTokens: 5, cachedInputTokens: 5 });
  });

  it("el consumo vacío no altera la suma", () => {
    expect(addUsage(EMPTY_USAGE, EMPTY_USAGE)).toEqual(EMPTY_USAGE);
  });
});

describe("metricsLogLine", () => {
  it("produce una línea JSON con lo necesario para auditar el gasto", () => {
    const line = metricsLogLine(METRICS);
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.event).toBe("assistant_request");
    expect(parsed.model).toBe("gemini-2.5-flash-lite");
    expect(parsed.costUsd).toBe(0.00046);
    expect(parsed.usage).toEqual(METRICS.usage);
  });

  it("no lleva contenido de la conversación ni PII (RNF-26)", () => {
    // El contrato es que la métrica NO tiene campos de texto libre: si alguien añade `reply` o
    // `messages`, este test lo bloquea.
    const keys = Object.keys(JSON.parse(metricsLogLine(METRICS)) as Record<string, unknown>).sort();

    expect(keys).toEqual([
      "costUsd",
      "droppedTurns",
      "event",
      "latencyMs",
      "llmCalls",
      "model",
      "provider",
      "redactions",
      "toolCalls",
      "usage",
    ]);
  });
});

describe("MonthlyBudget", () => {
  const enero = () => new Date("2026-01-15T10:00:00Z");

  it("acumula el gasto y avisa al superar el techo (modo suave, sigue sirviendo)", () => {
    const budget = new MonthlyBudget(1, "soft", enero);

    expect(budget.record(0.4).exceeded).toBe(false);
    const decision = budget.record(0.8);

    expect(decision.exceeded).toBe(true);
    expect(decision.allowed).toBe(true); // suave: no corta el servicio
    expect(decision.spentUsd).toBeCloseTo(1.2, 6);
  });

  it("en modo duro corta cuando el mes ya estaba agotado", () => {
    const budget = new MonthlyBudget(1, "hard", enero);

    expect(budget.record(0.6).allowed).toBe(true);
    expect(budget.record(0.6).allowed).toBe(true); // aún no estaba agotado al entrar
    expect(budget.record(0.1).allowed).toBe(false); // ya superado: no se vuelve a llamar
  });

  it("reinicia el contador al cambiar de mes", () => {
    let ahora = new Date("2026-01-15T10:00:00Z");
    const budget = new MonthlyBudget(1, "hard", () => ahora);

    budget.record(1.5);
    expect(budget.record(0).allowed).toBe(false);

    ahora = new Date("2026-02-01T10:00:00Z");
    expect(budget.spent()).toBe(0);
    expect(budget.record(0).allowed).toBe(true);
  });
});

describe("budgetConfig", () => {
  it("usa 5 USD al mes y modo suave por defecto", () => {
    expect(budgetConfig({})).toEqual({ budgetUsd: 5, mode: "soft" });
  });

  it("lee el presupuesto y el modo del entorno", () => {
    expect(budgetConfig({ ASSISTANT_MONTHLY_BUDGET_USD: "25", ASSISTANT_BUDGET_MODE: "hard" })).toEqual({
      budgetUsd: 25,
      mode: "hard",
    });
  });

  it("ignora valores inválidos en lugar de dejar el asistente sin presupuesto", () => {
    expect(budgetConfig({ ASSISTANT_MONTHLY_BUDGET_USD: "-3" }).budgetUsd).toBe(5);
    expect(budgetConfig({ ASSISTANT_MONTHLY_BUDGET_USD: "mucho" }).budgetUsd).toBe(5);
  });
});

describe("estimateCostUsd (reexportado)", () => {
  it("está disponible desde el módulo de métricas", () => {
    expect(estimateCostUsd("gemini-2.5-flash-lite", METRICS.usage)).toBe(0.00046);
  });
});
