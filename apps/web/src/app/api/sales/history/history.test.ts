import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSalesHistory } from "./route";

/**
 * El histórico público y su CSV leen del worker (fuente única, D-16): la MISMA que la tabla de
 * `/historico` y que el dashboard. El doble es el cliente del worker, no el repositorio.
 */
const { fetchHistory } = vi.hoisted(() => ({ fetchHistory: vi.fn() }));

vi.mock("@/lib/worker-api", () => ({ fetchHistory }));

const entry = (tokenId: string, saleType: "PRIMARY" | "SECONDARY", blockNumber: number) => ({
  tokenId,
  room: 101,
  dateYYYYMMDD: 20_260_901,
  roomType: "simple" as const,
  priceWei: "100000000000000000",
  saleType,
  seller: "0x1111111111111111111111111111111111111111",
  buyer: "0x2222222222222222222222222222222222222222",
  blockNumber,
  logIndex: 0,
  txHash: `0x${"a".repeat(64)}`,
  blockTimestamp: 1_789_000_000,
});

describe("Sales History Endpoint (US-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchHistory.mockResolvedValue([
      entry("10120260901", "SECONDARY", 200),
      entry("10220260901", "PRIMARY", 100),
    ]);
  });

  it("devuelve el histórico del worker en JSON paginado (orden total descendente)", async () => {
    const req = new NextRequest("http://localhost:3000/api/sales/history?limit=1&offset=1");
    const res = await getSalesHistory(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    // La página es una ventana sobre el histórico completo (el orden lo fija el worker).
    expect(data.items).toHaveLength(1);
    expect(data.items[0].tokenId).toBe("10220260901");
    expect(data.total).toBe(2);
    expect(data.limit).toBe(1);
    expect(data.offset).toBe(1);
  });

  it("exporta TODO el histórico en CSV (sin ventana) con la fecha de bloque en ISO", async () => {
    const req = new NextRequest("http://localhost:3000/api/sales/history?format=csv");
    const res = await getSalesHistory(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("sales_history_");

    const text = await res.text();
    expect(text).toContain("Token ID");
    expect(text).toContain("Precio (ETH)");
    expect(text).toContain("Marca temporal del bloque");
    expect(text).toContain("10120260901");
    expect(text).toContain("10220260901");
    expect(text).toContain("0.1"); // formatEther de 100000000000000000 wei
    expect(text).toContain(new Date(1_789_000_000 * 1000).toISOString());
  });

  it("si el worker no responde, responde 503 en vez de una lista vacía que miente", async () => {
    fetchHistory.mockRejectedValue(new Error("worker caído"));

    const res = await getSalesHistory(new NextRequest("http://localhost:3000/api/sales/history"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("DATA_UNAVAILABLE");
  });
});
