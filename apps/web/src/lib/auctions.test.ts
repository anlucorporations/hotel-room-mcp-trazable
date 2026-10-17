import { describe, expect, it } from "vitest";
import { fetchAuctions, latestPerToken } from "./auctions";

/**
 * Lectura de subastas (C2 · RF-13, B6: solo on-chain).
 *
 * La parte de red no se prueba aquí (la cubre la verificación en vivo del canario); sí se prueban la
 * pieza pura que decide la creación vigente por noche y la degradación honesta cuando la subasta no
 * está configurada en el entorno.
 */
describe("subastas · creación vigente por noche", () => {
  it("se queda con la creación más reciente de cada noche", () => {
    const tokenA = 201n * 100_000_000n + 20_267_001n;
    const tokenB = 202n * 100_000_000n + 20_267_002n;

    const latest = latestPerToken([
      { tokenId: tokenA, blockNumber: 100n },
      { tokenId: tokenB, blockNumber: 150n },
      { tokenId: tokenA, blockNumber: 300n }, // resubastada tras cancelar
      { tokenId: tokenA, blockNumber: 200n },
    ]);

    expect(latest).toHaveLength(2);
    expect(latest).toContain(tokenA);
    expect(latest).toContain(tokenB);
  });

  it("sin creaciones no hay subastas", () => {
    expect(latestPerToken([])).toEqual([]);
  });
});

describe("subastas · entorno sin subasta desplegada", () => {
  it("no consulta el RPC y lo declara (no se inventa una dirección)", async () => {
    // En pruebas no hay `NEXT_PUBLIC_AUCTION_ADDRESS`: la vista debe decirlo sin degradar.
    const result = await fetchAuctions();
    expect(result.configured).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.items).toEqual([]);
  });
});
