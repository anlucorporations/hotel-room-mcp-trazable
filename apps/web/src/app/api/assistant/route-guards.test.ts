import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ramas defensivas del endpoint del asistente.
 *
 * Los otros dos ficheros de test cubren el camino feliz y el saneado; este cubre los **bordes**:
 * cabeceras de IP, wallet inválida, conversación demasiado larga, cuerpo ilegible, variables de
 * entorno malformadas, límite por minuto, presupuesto agotado en modo duro y caída del modelo.
 * Existe porque son justo las ramas que dejan el gate de cobertura en rojo si nadie las prueba.
 */

const estado = vi.hoisted(() => ({
  modoFallo: "ninguno" as "ninguno" | "error" | "no-error",
  usage: { inputTokens: 3_000, outputTokens: 400, cachedInputTokens: 0 },
}));

vi.mock("@/lib/assistant/llm-provider", () => ({
  createLlmClient: async () => ({
    ok: true,
    provider: "vertex",
    model: "modelo-de-prueba",
    location: "europe-west1",
    client: {
      createMessage: async () => {
        if (estado.modoFallo === "error") throw new Error("el modelo se cayó");
        if (estado.modoFallo === "no-error") throw "caída sin Error";
        return { text: "Vale.", toolUses: [], usage: estado.usage };
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
      throw new Error("no debería llamarse");
    }
    async close(): Promise<void> {
      return undefined;
    }
  },
}));

/** Carga la ruta con el entorno ya fijado (el presupuesto se lee al importar el módulo). */
async function cargarPost(): Promise<(request: Request) => Promise<Response>> {
  vi.resetModules();
  const modulo = (await import("./route")) as { POST: (request: Request) => Promise<Response> };
  return modulo.POST;
}

const peticion = (
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): Request =>
  new Request("http://localhost/api/assistant", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const mensaje = (texto: string) => ({ messages: [{ role: "user", text: texto }] });

beforeEach(() => {
  estado.modoFallo = "ninguno";
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/assistant — bordes de la petición", () => {
  // La PRIMERA prueba del fichero paga la importación completa de la ruta (`vi.resetModules()` +
  // `import("./route")`: viem, wagmi, el grafo entero) dentro del presupuesto de 5 s del runner.
  // Medido el 2026-10-09: ~5,2 s solo por esa carga (y lo mismo en un árbol limpio en HEAD), así
  // que el 5 s por defecto la hacía fallar por tiempo, no por comportamiento. El tope explícito
  // no relaja la aserción: la petición sigue teniendo que responder 200.
  it(
    "toma la IP de `x-real-ip` cuando no hay `x-forwarded-for`",
    async () => {
      const POST = await cargarPost();
      const response = await POST(peticion(mensaje("hola"), { "content-type": "application/json", "x-real-ip": "10.0.0.9" }));

      expect(response.status).toBe(200);
    },
    30_000,
  );

  it("sin ninguna cabecera de IP sigue respondiendo (IP desconocida)", async () => {
    const POST = await cargarPost();
    const response = await POST(peticion(mensaje("hola")));

    expect(response.status).toBe(200);
  });

  it("ignora una wallet con formato inválido", async () => {
    const POST = await cargarPost();
    const response = await POST(peticion({ messages: [{ role: "user", text: "hola" }], walletAddress: "no-es-una-direccion" }));

    expect(response.status).toBe(200);
  });

  it("acepta una wallet válida (y limita también por ella)", async () => {
    const POST = await cargarPost();
    const response = await POST(
      peticion(
        { messages: [{ role: "user", text: "hola" }], walletAddress: "0x1234567890abcdef1234567890abcdef12345678" },
        { "content-type": "application/json", "x-forwarded-for": "10.1.0.1" },
      ),
    );

    expect(response.status).toBe(200);
  });

  it("rechaza una conversación que supera el presupuesto de caracteres", async () => {
    const POST = await cargarPost();
    const largos = Array.from({ length: 4 }, () => ({ role: "user", text: "x".repeat(4_000) }));
    const response = await POST(peticion({ messages: largos }, { "content-type": "application/json", "x-forwarded-for": "10.2.0.1" }));

    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toEqual({ error: "BAD_REQUEST" });
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const POST = await cargarPost();
    const response = await POST(peticion("esto no es json", { "content-type": "application/json", "x-forwarded-for": "10.3.0.1" }));

    expect(response.status).toBe(400);
  });

  it("tolera una variable de entorno malformada (usa el valor por defecto)", async () => {
    vi.stubEnv("ASSISTANT_MAX_TURNS", "no-es-un-numero");
    const POST = await cargarPost();
    const response = await POST(peticion(mensaje("hola"), { "content-type": "application/json", "x-forwarded-for": "10.4.0.1" }));

    expect(response.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it("corta con 429 al superar el límite por minuto", async () => {
    const POST = await cargarPost();
    const cabeceras = { "content-type": "application/json", "x-forwarded-for": "10.5.0.1" };
    const codigos: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codigos.push((await POST(peticion(mensaje("hola"), cabeceras))).status);
    }

    expect(codigos.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codigos[10]).toBe(429);
  });
});

describe("POST /api/assistant — presupuesto agotado y caída del modelo", () => {
  it("en modo duro deja de servir cuando el mes está agotado", async () => {
    vi.stubEnv("ASSISTANT_BUDGET_MODE", "hard");
    vi.stubEnv("ASSISTANT_MONTHLY_BUDGET_USD", "0.000001");
    const POST = await cargarPost();
    const cabeceras = { "content-type": "application/json", "x-forwarded-for": "10.6.0.1" };

    // La primera petición gasta más que el techo (y registra el aviso de presupuesto superado).
    expect((await POST(peticion(mensaje("hola"), cabeceras))).status).toBe(200);
    // La segunda ya no llega al modelo.
    const segunda = await POST(peticion(mensaje("hola"), cabeceras));

    expect(segunda.status).toBe(503);
    expect((await segunda.json()) as unknown).toEqual({ error: "ASSISTANT_BUDGET_EXCEEDED" });
    vi.unstubAllEnvs();
  });

  it("responde 503 si el modelo lanza un Error", async () => {
    estado.modoFallo = "error";
    const POST = await cargarPost();
    const response = await POST(peticion(mensaje("hola"), { "content-type": "application/json", "x-forwarded-for": "10.7.0.1" }));

    expect(response.status).toBe(503);
  });

  it("responde 503 también si lo lanzado no es un Error", async () => {
    estado.modoFallo = "no-error";
    const POST = await cargarPost();
    const response = await POST(peticion(mensaje("hola"), { "content-type": "application/json", "x-forwarded-for": "10.8.0.1" }));

    expect(response.status).toBe(503);
  });
});
