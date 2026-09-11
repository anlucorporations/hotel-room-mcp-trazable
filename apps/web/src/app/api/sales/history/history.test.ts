import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getSalesHistory } from "./route";
import { NextRequest } from "next/server";

vi.mock("@hotel/shared", async () => {
  const actual = await vi.importActual<any>("@hotel/shared");
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      getSalesHistory: vi.fn().mockResolvedValue({
        items: [
          {
            id: "sale-1",
            tokenId: "10120260901",
            seller: "0x1111111111111111111111111111111111111111",
            buyer: "0x2222222222222222222222222222222222222222",
            priceInWei: "100000000000000000",
            royaltyAmountWei: "5000000000000000",
            isSecondary: false,
            txHash: "0xtxhash1",
            blockNumber: 123456,
            blockTimestamp: new Date("2026-09-10T12:00:00.000Z"),
          },
        ],
        total: 1,
      }),
    })),
  };
});

describe("Sales History Endpoint (US-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debe devolver el histórico en formato JSON paginado", async () => {
    const req = new NextRequest("http://localhost:3000/api/sales/history?limit=10&offset=0");
    const res = await getSalesHistory(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.items[0].tokenId).toBe("10120260901");
  });

  it("debe exportar en formato CSV cuando format=csv", async () => {
    const req = new NextRequest("http://localhost:3000/api/sales/history?format=csv");
    const res = await getSalesHistory(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("sales_history_");

    const text = await res.text();
    expect(text).toContain("ID,Token ID,Vendedor,Comprador,Precio (Wei)");
    expect(text).toContain("10120260901");
    expect(text).toContain("0.1"); // formatEther de 100000000000000000 wei
  });
});
