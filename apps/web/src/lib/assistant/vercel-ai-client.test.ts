import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import type { ToolDescriptor, Turn } from "./types";
import {
  VercelAiLlmClient,
  isUnusableText,
  normalizeToolInput,
  toModelMessages,
  toToolSet,
} from "./vercel-ai-client";

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

describe("respuesta vacía del proveedor (defecto medido en H4)", () => {
  it("reintenta una vez y devuelve la respuesta del segundo intento", async () => {
    let llamadas = 0;
    const model = mockModel({
      doGenerate: async () => {
        llamadas += 1;
        return {
          content: llamadas === 1 ? [] : [{ type: "text", text: "Sí, puedes revenderla." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: USAGE,
          warnings: [],
        };
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "¿puedo revender mi noche?" }],
      tools: [TOOL],
    });

    expect(llamadas).toBe(2);
    expect(response.text).toBe("Sí, puedes revenderla.");
  });

  it("suma el consumo de los dos intentos, porque el proveedor los factura", async () => {
    let llamadas = 0;
    const model = mockModel({
      doGenerate: async () => {
        llamadas += 1;
        return {
          content: llamadas === 1 ? [] : [{ type: "text", text: "Aquí tienes." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: USAGE,
          warnings: [],
        };
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    // USAGE declara 10 tokens de entrada y 5 de salida por llamada.
    expect(response.usage).toEqual({ inputTokens: 20, outputTokens: 10, cachedInputTokens: 0 });
  });

  it("no reintenta si la respuesta trae una llamada a herramienta aunque no traiga texto", async () => {
    let llamadas = 0;
    const model = mockModel({
      doGenerate: async () => {
        llamadas += 1;
        return {
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "checkAvailability", input: "{}" }],
          finishReason: { unified: "tool-calls", raw: "tool-calls" },
          usage: USAGE,
          warnings: [],
        };
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "¿está libre la 102?" }],
      tools: [TOOL],
    });

    expect(llamadas).toBe(1);
    expect(response.toolUses).toHaveLength(1);
  });

  it("tras agotar el reintento devuelve el texto vacío en lugar de fallar", async () => {
    const model = mockModel({
      doGenerate: {
        content: [],
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

    expect(response.text).toBe("");
    expect(response.toolUses).toEqual([]);
  });
});

describe("isUnusableText — pseudollamadas en texto (defecto medido en H4)", () => {
  it("detecta la llamada a herramienta escrita como texto", () => {
    expect(isUnusableText("tool_code\nprint(default_api.searchHotelManuals())")).toBe(true);
    expect(isUnusableText("print(default_api.checkAvailability(room=102))")).toBe(true);
    expect(isUnusableText("default_api.searchHotelManuals(query='reventa')")).toBe(true);
  });

  it("no confunde una respuesta legítima", () => {
    expect(isUnusableText("Puedes revender tu noche desde Mis noches.")).toBe(false);
    expect(isUnusableText("La 102 está libre el 20260615.")).toBe(false);
    expect(isUnusableText("El hotel abre a las 14:00.")).toBe(false);
  });

  it("el texto vacío o en blanco también es inservible", () => {
    expect(isUnusableText("")).toBe(true);
    expect(isUnusableText("   \n  ")).toBe(true);
  });
});

describe("reintento ante pseudollamada en texto", () => {
  it("reintenta una vez y devuelve la respuesta buena", async () => {
    let llamadas = 0;
    const model = mockModel({
      doGenerate: async () => {
        llamadas += 1;
        return {
          content:
            llamadas === 1
              ? [{ type: "text", text: "tool_code\nprint(default_api.searchHotelManuals())" }]
              : [{ type: "text", text: "Sí, puedes dejar una reseña desde la app." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: USAGE,
          warnings: [],
        };
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "¿puedo dejar una reseña?" }],
      tools: [TOOL],
    });

    expect(llamadas).toBe(2);
    expect(response.text).toBe("Sí, puedes dejar una reseña desde la app.");
  });
});

describe("presupuesto de razonamiento (palanca medida en H4)", () => {
  const captura = () => {
    const visto: Record<string, unknown>[] = [];
    const model = mockModel({
      doGenerate: async (options: { providerOptions?: Record<string, unknown> }) => {
        visto.push(options.providerOptions ?? {});
        return {
          content: [{ type: "text", text: "Vale." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: USAGE,
          warnings: [],
        };
      },
    });
    return { model, visto };
  };

  it("lo envía al proveedor: por defecto desactivado (0)", async () => {
    const { model, visto } = captura();
    await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(visto[0]).toEqual({ vertex: { thinkingConfig: { thinkingBudget: 0 } } });
  });

  it("se puede volver a activar con un presupuesto explícito", async () => {
    const { model, visto } = captura();
    await new VercelAiLlmClient({ model, thinkingBudget: 512 }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(visto[0]).toEqual({ vertex: { thinkingConfig: { thinkingBudget: 512 } } });
  });
});

describe("bordes del adaptador (ramas defensivas)", () => {
  it("si el proveedor no informa del consumo, todo queda a cero", async () => {
    // El SDK sí exige el objeto `usage`, pero sus totales pueden venir sin definir: es la rama
    // `?? 0` del adaptador, que evita propagar `undefined` a la telemetría.
    const model = mockModel({
      doGenerate: {
        content: [{ type: "text", text: "Hola." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
        warnings: [],
      },
    });

    const response = await new VercelAiLlmClient({ model }).createMessage({
      system: SYSTEM,
      turns: [{ role: "user", text: "hola" }],
      tools: [TOOL],
    });

    expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
  });

  it("un turno de asistente sin texto no añade una parte vacía", () => {
    const mensajes = toModelMessages([
      { role: "assistant", text: "", toolUses: [{ id: "c1", name: "checkAvailability", input: {} }] },
    ]);

    const contenido = mensajes[0] as { content: { type: string }[] };
    expect(contenido.content.some((parte) => parte.type === "text")).toBe(false);
    expect(contenido.content.some((parte) => parte.type === "tool-call")).toBe(true);
  });

  it("un resultado de herramienta sin llamada previa usa el nombre de reserva", () => {
    const mensajes = toModelMessages([
      {
        role: "user",
        text: "",
        toolResults: [{ toolUseId: "desconocido", content: JSON.stringify({ ok: true }) }],
      },
    ]);

    const contenido = mensajes[0] as { content: { type: string; toolName?: string }[] };
    expect(contenido.content[0]?.toolName).toBe("unknown");
  });

  it("un turno de usuario sin texto se envía como cadena vacía", () => {
    const mensajes = toModelMessages([{ role: "user", text: undefined as never }]);

    const contenido = mensajes[0] as { content: string };
    expect(contenido.content).toBe("");
  });
});
