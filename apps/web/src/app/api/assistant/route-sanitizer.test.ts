import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueba de integración del saneado de PII en la frontera real del endpoint (RNF-27).
 *
 * El test de `pii-sanitizer` comprueba la función; este comprueba que la ruta la **aplica** antes de
 * salir al proveedor. Para eso se doblan el cliente del LLM y la pasarela MCP (no se abre ninguna
 * conexión) y se inspecciona lo que el modelo habría recibido.
 */

const captured = vi.hoisted(() => ({ turns: [] as unknown[] }));

vi.mock("@/lib/assistant/llm-provider", () => ({
  createLlmClient: async () => ({
    ok: true,
    provider: "vertex",
    model: "modelo-de-prueba",
    location: "europe-west1",
    client: {
      createMessage: async (request: { turns: unknown[] }) => {
        captured.turns = request.turns;
        return { text: "Vale.", toolUses: [] };
      },
    },
  }),
}));

vi.mock("@/lib/assistant/mcp-gateway", () => ({
  McpToolGateway: class {
    async listTools(): Promise<unknown[]> {
      return [];
    }
    async callTool(): Promise<never> {
      throw new Error("la pasarela no debería usarse en esta prueba");
    }
    async close(): Promise<void> {
      return undefined;
    }
  },
}));

import { POST } from "./route";

const post = (messages: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    }),
  );

beforeEach(() => {
  captured.turns = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/assistant — la PII no sale hacia el modelo", () => {
  it("enmascara correo, teléfono y nombre antes de llamar al LLM", async () => {
    const response = await post([
      {
        role: "user",
        text: "Hola, me llamo Ana López, mi correo es ana@example.com y mi móvil es 611 222 333.",
      },
    ]);

    expect(response.status).toBe(200);

    const turn = captured.turns[0] as { text: string } | undefined;
    expect(turn?.text).toContain("[NOMBRE]");
    expect(turn?.text).toContain("[CORREO]");
    expect(turn?.text).toContain("[TELÉFONO]");
    // Y lo importante: el dato original no viaja.
    expect(turn?.text).not.toContain("Ana López");
    expect(turn?.text).not.toContain("ana@example.com");
    expect(turn?.text).not.toContain("611 222 333");
  });

  it("sanea también los turnos anteriores de la conversación", async () => {
    await post([
      { role: "user", text: "Mi DNI es 12345678Z, ¿puedo reservar?" },
      { role: "assistant", text: "Claro, dime la fecha." },
      { role: "user", text: "El 20260615" },
    ]);

    const first = captured.turns[0] as { text: string };
    const last = captured.turns[2] as { text: string };
    expect(first.text).toContain("[DOCUMENTO]");
    expect(first.text).not.toContain("12345678Z");
    // Lo que el asistente necesita sigue intacto.
    expect(last.text).toContain("20260615");
  });

  it("no altera la conversación cuando no hay PII", async () => {
    await post([{ role: "user", text: "¿Qué noches quedan libres en agosto?" }]);

    const turn = captured.turns[0] as { text: string };
    expect(turn.text).toBe("¿Qué noches quedan libres en agosto?");
  });
});
