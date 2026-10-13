import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPurchaseTxData } from "@hotel/shared/domain";

/**
 * Integración del endpoint para la **reserva de una estancia** (petición del responsable,
 * 2026-10-13: «no se realizan la reserva en rango de fechas»).
 *
 * El camino completo del servidor con un LLM y un MCP de dobles: el modelo llama a `prepareStayTx`
 * con el rango, el MCP devuelve una tx por noche y el endpoint debe entregar **todas** las compras
 * preparadas (no solo la última), ya validadas. Es el contrato que consume el panel de estancia.
 */

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const TX = (tokenId: string) =>
  buildPurchaseTxData({
    tokenId: BigInt(tokenId),
    priceWei: 50_000_000_000_000_000n,
    saleType: "PRIMARY",
    contractAddress: CONTRACT,
    chainId: 81234,
  });

const estado = vi.hoisted(() => ({
  respuestas: [] as { text: string; toolUses: { id: string; name: string; input: Record<string, unknown> }[] }[],
  plan: null as unknown,
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
      return [{ name: "prepareStayTx", description: "", inputSchema: {} }];
    }
    async callTool(): Promise<unknown> {
      return estado.plan;
    }
    async close(): Promise<void> {
      return undefined;
    }
  },
}));

// La validación server-side se dobla: aquí se prueba la orquestación, no la lectura on-chain.
vi.mock("@/lib/assistant/chain-pricing", () => ({
  createTxValidator: () => async () => ({ ok: true, reasons: [] }),
}));

import { POST } from "./route";

const post = (messages: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.11" },
      body: JSON.stringify({ messages }),
    }),
  );

beforeEach(() => {
  estado.respuestas = [];
  estado.plan = {
    room: 102,
    checkIn: 20260615,
    checkOut: 20260618,
    totalPriceWei: "150000000000000000",
    nights: [
      { tokenId: "10220260615", dateYYYYMMDD: 20260615, tx: TX("10220260615") },
      { tokenId: "10220260616", dateYYYYMMDD: 20260616, tx: TX("10220260616") },
      { tokenId: "10220260617", dateYYYYMMDD: 20260617, tx: TX("10220260617") },
    ],
  };
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/assistant — reserva en rango de fechas", () => {
  it("entrega una compra preparada por noche, en orden, y no navega (el panel de firma manda)", async () => {
    estado.respuestas = [
      {
        text: "Preparo la estancia.",
        toolUses: [
          { id: "s1", name: "prepareStayTx", input: { checkIn: 20260615, checkOut: 20260618, room: 102 } },
        ],
      },
      { text: "Tienes tres noches listas para firmar.", toolUses: [] },
    ];

    const res = await post([{ role: "user", text: "quiero la 102 del 15 al 18 de junio" }]);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preparedPurchase: { tokenId: string } | null;
      preparedPurchases: { tokenId: string }[];
      pageAction: unknown;
    };

    expect(body.preparedPurchases.map((p) => p.tokenId)).toEqual([
      "10220260615",
      "10220260616",
      "10220260617",
    ]);
    // Compatibilidad: la compra suelta sigue siendo la primera noche.
    expect(body.preparedPurchase?.tokenId).toBe("10220260615");
    // Con firmas pendientes no se navega: el panel de estancia es el siguiente paso del huésped.
    expect(body.pageAction).toBeNull();
  });

  it("sin estancia preparada la lista va vacía (nada que firmar)", async () => {
    estado.respuestas = [{ text: "Dime qué fechas quieres.", toolUses: [] }];

    const res = await post([{ role: "user", text: "hola" }]);
    const body = (await res.json()) as { preparedPurchases: unknown[]; preparedPurchase: unknown };

    expect(body.preparedPurchases).toEqual([]);
    expect(body.preparedPurchase).toBeNull();
  });
});
