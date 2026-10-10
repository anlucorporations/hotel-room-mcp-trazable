import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integración del endpoint para la **acción de página** (petición del responsable, 2026-10-10:
 * «asegúrate de que cuando se solicita una búsqueda de habitaciones se muestre en la ventana»).
 *
 * El caso que importa es el del **respaldo**: el modelo responde de memoria, sin llamar a ninguna
 * herramienta del catálogo. Antes, esa respuesta no traía `pageAction` y el usuario se quedaba sin ver
 * nada en la página; ahora el endpoint la abre igualmente (y filtrando por el tipo si lo nombró).
 */

const estado = vi.hoisted(() => ({
  /** Respuesta del modelo: texto y, si toca, llamadas a herramienta. */
  respuestas: [] as { text: string; toolUses: { id: string; name: string; input: Record<string, unknown> }[] }[],
}));

vi.mock("@/lib/assistant/llm-provider", () => ({
  createLlmClient: async () => ({
    ok: true,
    provider: "vertex",
    model: "modelo-de-prueba",
    location: "europe-west1",
    client: {
      createMessage: async () =>
        estado.respuestas.shift() ?? { text: "Vale.", toolUses: [], usage: undefined },
    },
  }),
}));

vi.mock("@/lib/assistant/mcp-gateway", () => ({
  McpToolGateway: class {
    async listTools(): Promise<unknown[]> {
      return [
        { name: "checkAvailability", description: "", inputSchema: {} },
        { name: "listAvailableNights", description: "", inputSchema: {} },
      ];
    }
    async callTool(): Promise<unknown> {
      return { exists: true, available: true, tokenId: "10120260620", priceWei: "1", saleType: "PRIMARY" };
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
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.9" },
      body: JSON.stringify({ messages }),
    }),
  );

const pageActionDe = async (messages: unknown): Promise<unknown> => {
  const res = await post(messages);
  expect(res.status).toBe(200);
  return ((await res.json()) as { pageAction: unknown }).pageAction;
};

beforeEach(() => {
  estado.respuestas = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/assistant — la búsqueda de habitaciones se muestra en la página", () => {
  it("si el modelo responde sin consultar el catálogo, el respaldo abre el catálogo filtrado por tipo", async () => {
    estado.respuestas = [{ text: "Hay habitaciones sencillas disponibles.", toolUses: [] }];

    const action = (await pageActionDe([
      { role: "user", text: "¿qué habitaciones sencillas hay?" },
    ])) as { href: string; search: { type: string } } | null;

    expect(action).not.toBeNull();
    expect(action!.href).toBe("/catalogo?tipo=simple");
    expect(action!.search.type).toBe("simple");
  });

  it("sin tipo nombrado, el respaldo abre el catálogo entero", async () => {
    estado.respuestas = [{ text: "Te muestro lo que hay.", toolUses: [] }];

    const action = (await pageActionDe([
      { role: "user", text: "muéstrame las habitaciones disponibles" },
    ])) as { href: string } | null;

    expect(action!.href).toBe("/catalogo");
  });

  it("una consulta que NO es de habitaciones no mueve al usuario de página", async () => {
    estado.respuestas = [{ text: "El desayuno se sirve de 7 a 10.", toolUses: [] }];

    expect(await pageActionDe([{ role: "user", text: "¿a qué hora es el desayuno?" }])).toBeNull();
  });

  it("la consulta REAL del modelo manda: usa sus filtros, no el respaldo", async () => {
    estado.respuestas = [
      {
        text: "Compruebo esa noche.",
        toolUses: [{ id: "t1", name: "checkAvailability", input: { room: 7, date: 20260622 } }],
      },
      { text: "Sí, está libre.", toolUses: [] },
    ];

    const action = (await pageActionDe([
      { role: "user", text: "¿está libre la habitación 7 el 22 de junio?" },
    ])) as { href: string } | null;

    expect(action!.href).toBe("/catalogo?desde=2026-06-22&hasta=2026-06-22&buscar=7");
  });
});
