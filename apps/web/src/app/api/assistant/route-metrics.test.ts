import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prueba de integración de la **telemetría** del endpoint (RNF-22/RNF-24/RNF-25/RNF-26).
 *
 * Comprueba que cada petición deja una línea con el consumo, el coste estimado y la latencia, que esa
 * línea no lleva contenido ni PII, y que la respuesta al cliente **no** cambia de contrato.
 */

vi.mock("@/lib/assistant/llm-provider", () => ({
  createLlmClient: async () => ({
    ok: true,
    provider: "vertex",
    model: "modelo-de-prueba",
    location: "europe-west1",
    client: {
      createMessage: async () => ({
        text: "Vale.",
        toolUses: [],
        usage: { inputTokens: 3_000, outputTokens: 400, cachedInputTokens: 0 },
      }),
    },
  }),
}));

vi.mock("@/lib/assistant/mcp-gateway", () => ({
  McpToolGateway: class {
    async listTools(): Promise<unknown[]> {
      return [{ name: "checkAvailability", description: "", inputSchema: {} }];
    }
    async callTool(): Promise<never> {
      throw new Error("no debería llamarse");
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
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.7" },
      body: JSON.stringify({ messages }),
    }),
  );

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const metricsLine = (): Record<string, unknown> => {
  const line = warned.find((entry) => entry.includes('"event":"assistant_request"'));
  expect(line, "no se registró la línea de telemetría").toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
};

describe("POST /api/assistant — telemetría por petición", () => {
  it("registra consumo, coste y latencia", async () => {
    await post([{ role: "user", text: "¿está libre la 102 el 15 de junio?" }]);
    const metrics = metricsLine();

    expect(metrics.model).toBe("modelo-de-prueba");
    expect(metrics.provider).toBe("vertex");
    expect(metrics.llmCalls).toBe(1);
    expect(metrics.usage).toEqual({ inputTokens: 3_000, outputTokens: 400, cachedInputTokens: 0 });
    expect(metrics.costUsd).toBeGreaterThan(0);
    expect(metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("la línea de telemetría no lleva la conversación ni PII", async () => {
    await post([{ role: "user", text: "Soy Ana y mi correo es ana@example.com" }]);

    const line = warned.find((entry) => entry.includes('"event":"assistant_request"')) as string;
    expect(line).not.toContain("Ana");
    expect(line).not.toContain("ana@example.com");
    // Pero sí consta que se enmascaró algo.
    expect(metricsLine().redactions).toEqual(["correo", "nombre"]);
  });

  it("la respuesta al cliente conserva el contrato (la telemetría no sale)", async () => {
    const response = await post([{ role: "user", text: "hola" }]);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["domainToolCalls", "preparedPurchase", "reply"]);
  });
});
