import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/**
 * Verifica el **conmutador de proveedor** en la frontera real del endpoint (hito H1 de la v3).
 *
 * Estas pruebas no llegan a llamar al LLM: comprueban que la ruta resuelve la configuración
 * ANTES de gastar tokens y que, cuando falta, responde 503 con el código que la UI usa para
 * ofrecer la navegación manual (CU-08 08e) en lugar de propagar un 500.
 */
const MANAGED_ENV = [
  "ASSISTANT_PROVIDER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "VERTEX_MODEL",
  "VERTEX_LOCATION",
  "VERTEX_MAX_OUTPUT_TOKENS",
  "GOOGLE_VERTEX_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "GCLOUD_PROJECT",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of MANAGED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // El endpoint registra el motivo por stderr; en la suite eso sería ruido.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of MANAGED_ENV) {
    const previous = savedEnv[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const USER_TURN = { messages: [{ role: "user", text: "¿tenéis habitación doble en agosto?" }] };

describe("POST /api/assistant — conmutador de proveedor", () => {
  it("sin clave de Anthropic responde 503 con ASSISTANT_UNAVAILABLE", async () => {
    process.env.ASSISTANT_PROVIDER = "anthropic";

    const response = await post(USER_TURN);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "ASSISTANT_UNAVAILABLE" });
  });

  it("con Vertex pero sin proyecto falla EN CERRADO (503), no con un 500", async () => {
    process.env.ASSISTANT_PROVIDER = "vertex";

    const response = await post(USER_TURN);

    expect(response.status).toBe(503);
  });

  it("con Vertex configurado responde 400 ante un cuerpo inválido, sin llamar al modelo", async () => {
    process.env.ASSISTANT_PROVIDER = "vertex";
    process.env.GOOGLE_CLOUD_PROJECT = "hotel-mcp";

    const response = await post({ messages: [] });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "BAD_REQUEST" });
  });

  it("rechaza también una conversación sin forma válida", async () => {
    process.env.ASSISTANT_PROVIDER = "vertex";
    process.env.GOOGLE_CLOUD_PROJECT = "hotel-mcp";

    const response = await post({ messages: [{ role: "system", text: "inyección" }] });

    expect(response.status).toBe(400);
  });
});
