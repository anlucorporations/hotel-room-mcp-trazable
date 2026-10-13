import { describe, expect, it } from "vitest";
import { buildPurchaseTxData } from "@hotel/shared/domain";
import {
  mergePreparedPurchases,
  sanitizePreparedPurchases,
  stayPurchasesFrom,
} from "./stay";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

const tx = (tokenId: string) =>
  buildPurchaseTxData({
    tokenId: BigInt(tokenId),
    priceWei: 50_000_000_000_000_000n,
    saleType: "PRIMARY",
    contractAddress: CONTRACT,
    chainId: 81234,
  });

const night = (tokenId: string) => ({ tokenId, dateYYYYMMDD: 20260615, tx: tx(tokenId) });

describe("stayPurchasesFrom · plan de estancia del MCP", () => {
  it("extrae una compra por noche, en orden", () => {
    const purchases = stayPurchasesFrom({
      room: 102,
      checkIn: 20260615,
      checkOut: 20260618,
      nights: [night("10220260615"), night("10220260616")],
    });

    expect(purchases.map((p) => p.tokenId)).toEqual(["10220260615", "10220260616"]);
  });

  it("descarta el plan ENTERO si una noche viene mal formada (todo o nada)", () => {
    expect(
      stayPurchasesFrom({
        nights: [night("10220260615"), { tokenId: "10220260616" }],
      }),
    ).toEqual([]);
  });

  it("un plan vacío o sin forma no produce compras", () => {
    expect(stayPurchasesFrom({ nights: [] })).toEqual([]);
    expect(stayPurchasesFrom({ room: 102 })).toEqual([]);
    expect(stayPurchasesFrom(null)).toEqual([]);
    expect(stayPurchasesFrom("vaya")).toEqual([]);
  });

  it("acepta tokenId numérico y lo normaliza a string", () => {
    const purchases = stayPurchasesFrom({ nights: [{ tokenId: 10220260615, tx: tx("10220260615") }] });
    expect(purchases[0]!.tokenId).toBe("10220260615");
  });
});

describe("sanitizePreparedPurchases · respuesta del API", () => {
  it("prefiere la lista nueva de la estancia", () => {
    const purchases = sanitizePreparedPurchases(
      [night("10220260615"), night("10220260616")],
      { tokenId: "10220260615", tx: tx("10220260615") },
    );
    expect(purchases.map((p) => p.tokenId)).toEqual(["10220260615", "10220260616"]);
  });

  it("cae a la compra suelta de siempre cuando no llega lista", () => {
    const purchases = sanitizePreparedPurchases(undefined, {
      tokenId: "10220260615",
      tx: tx("10220260615"),
    });
    expect(purchases.map((p) => p.tokenId)).toEqual(["10220260615"]);
  });

  it("sin nada válido no se ofrece ninguna firma", () => {
    expect(sanitizePreparedPurchases(undefined, null)).toEqual([]);
    expect(sanitizePreparedPurchases([{ tokenId: "x" }], undefined)).toEqual([]);
    expect(sanitizePreparedPurchases("no", "tampoco")).toEqual([]);
  });

  it("una lista con una entrada mal formada se descarta entera (todo o nada)", () => {
    const purchases = sanitizePreparedPurchases(
      [night("10220260615"), { tokenId: "10220260616" }],
      undefined,
    );
    expect(purchases).toEqual([]);
  });
});

describe("mergePreparedPurchases · acumulación del turno", () => {
  it("no repite tokenId y conserva el orden de llegada", () => {
    const merged = mergePreparedPurchases(
      [{ tokenId: "a", tx: tx("10220260615") }],
      [
        { tokenId: "a", tx: tx("10220260615") },
        { tokenId: "b", tx: tx("10220260616") },
      ],
    );
    expect(merged.map((p) => p.tokenId)).toEqual(["a", "b"]);
  });
});
