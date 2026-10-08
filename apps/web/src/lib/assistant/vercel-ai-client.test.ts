import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { ToolDescriptor, Turn } from "./types";
import { VercelAiLlmClient, normalizeToolInput, toModelMessages, toToolSet } from "./vercel-ai-client";

type MockOptions = ConstructorParameters<typeof MockLanguageModelV4>[0];

/** Consumo ficticio con la forma que exige la especificación V4 del SDK. */
const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** Doble determinista del modelo: sin red y sin credenciales (el SDK lo documenta en `ai/test`). */
const mockModel = (options: MockOptions): MockLanguageModelV4 => new MockLanguageModelV4(options);

const TOOL: ToolDescriptor = {
  name: "checkAvailability",
  description: "Comprueba si una noche concreta es comprable.",
  inputSchema: {
    type: "object",
    properties: { room: { type: "number" }, date: { type: "number" } },
    required: ["room", "date"],
  },
};

const SYSTEM = "Eres el asistente del Hotel Marina del Sol.";

describe("VercelAiLlmClient", () => {
  it("devuelve el texto del modelo y ninguna herramienta cuando no las pide", async () => {
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "Hola, ¿en qué te ayudo?" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(response.text).toBe("Hola, ¿en qué te ayudo?");
    expect(response.toolUses).toEqual([]);
  });

  it("traduce un tool call del SDK al ToolUse neutral del orquestador", async () => {
    const model = mockModel({
      doGenerate: {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "checkAvailability",
            input: JSON.stringify({ room: 3, date: 20260615 }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: USAGE,
        warnings: [],
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "¿está libre la 3 el 15 de junio?" }],
      tools: [TOOL],
    });

    expect(response.toolUses).toEqual([
      { id: "call-1", name: "checkAvailability", input: { room: 3, date: 20260615 } },
    ]);
    // El texto puede venir vacío cuando el modelo solo pide herramienta.
    expect(response.text).toBe("");
  });

  it("envía el prompt de sistema, las herramientas y el presupuesto de salida al SDK", async () => {
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "ok" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      },
    });

    await new VercelAiLlmClient({ model, maxOutputTokens: 256 }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    const call = model.doGenerateCalls[0];
    expect(call?.prompt[0]).toMatchObject({ role: "system" });
    expect(call?.maxOutputTokens).toBe(256);
    expect(call?.tools?.map((tool) => tool.name)).toEqual(["checkAvailability"]);
  });

  it("reconstruye el nombre de la herramienta en el turno de resultados", async () => {
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "listo" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      },
    });

    const turns: Turn[] = [
      { role: "user", text: "¿está libre?" },
      {
        role: "assistant",
        text: "",
        toolUses: [{ id: "call-1", name: "checkAvailability", input: { room: 3, date: 20260615 } }],
      },
      { role: "user", toolResults: [{ toolUseId: "call-1", content: '{"available":true}' }] },
    ];

    await new VercelAiLlmClient({ model }).createMessage({ system: SYSTEM, turns, tools: [TOOL] });

    const toolMessage = model.doGenerateCalls[0]?.prompt.find((message) => message.role === "tool");
    expect(toolMessage?.content).toMatchObject([
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "checkAvailability",
        output: { type: "text", value: '{"available":true}' },
      },
    ]);
  });
});

describe("toToolSet", () => {  it("declara las herramientas SIN execute (el orquestador sigue siendo quien las ejecuta)", () => {
    const set = toToolSet([TOOL]);
    expect(set.checkAvailability?.description).toBe(TOOL.description);
    expect(set.checkAvailability?.execute).toBeUndefined();
  });

  it("un conjunto vacío es válido (la ronda de cierre no ofrece herramientas)", () => {
    expect(toToolSet([])).toEqual({});
  });
});

describe("toModelMessages", () => {
  it("marca los resultados fallidos como error-text", () => {
    const turns: Turn[] = [
      {
        role: "assistant",
        text: "",
        toolUses: [{ id: "call-9", name: "buildPurchaseTx", input: {} }],
      },
      {
        role: "user",
        toolResults: [{ toolUseId: "call-9", content: '{"error":"NO_COMPRABLE"}', isError: true }],
      },
    ];

    expect(toModelMessages(turns)).toMatchObject([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-9" }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-9",
            toolName: "buildPurchaseTx",
            output: { type: "error-text", value: '{"error":"NO_COMPRABLE"}' },
          },
        ],
      },
    ]);
  });

  it("omite el turno del asistente cuando no tiene ni texto ni herramientas", () => {
    expect(toModelMessages([{ role: "assistant", text: "", toolUses: [] }])).toEqual([]);
  });
});

describe("normalizeToolInput", () => {
  it("acepta el objeto ya parseado (variante `LanguageModelV4ToolCallPart`)", () => {
    expect(normalizeToolInput({ room: 3 })).toEqual({ room: 3 });
  });

  it("parsea la variante en crudo `LanguageModelV4ToolCall` (input: string)", () => {
    expect(normalizeToolInput('{"room":3,"date":20260615}')).toEqual({ room: 3, date: 20260615 });
  });

  it("nunca propaga una entrada inválida al MCP: cae a objeto vacío", () => {
    expect(normalizeToolInput("no-es-json")).toEqual({});
    expect(normalizeToolInput("[1,2]")).toEqual({});
    expect(normalizeToolInput(undefined)).toEqual({});
    expect(normalizeToolInput('"texto"')).toEqual({});
  });
});

describe("consumo de tokens (H4)", () => {
  it("traslada el consumo del SDK, incluidos los tokens servidos desde caché", async () => {
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "Hola." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1_234, noCache: 234, cacheRead: 1_000, cacheWrite: 0 },
          outputTokens: { total: 56, text: 56, reasoning: 0 },
        },
        warnings: [],
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(response.usage).toEqual({ inputTokens: 1_234, outputTokens: 56, cachedInputTokens: 1_000 });
  });

  it("si el modelo no informa del consumo, devuelve ceros en lugar de undefined", async () => {
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "Hola." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: USAGE,
        warnings: [],
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(response.usage?.inputTokens).toBe(10);
    expect(response.usage?.cachedInputTokens).toBe(0);
  });
});
