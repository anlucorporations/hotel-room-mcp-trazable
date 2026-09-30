import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { classifySoldOnce, filterSoldOnChain, type NightView } from "./nights";

/**
 * Guardián §35 — **el catálogo no ofrece noches que la cadena ya vendió**.
 *
 * Producción (v12) servía como `AVAILABLE` noches con `Sale` confirmado porque el índice
 * PostgreSQL iba desfasado (worker sin redesplegar). El huésped pulsaba Reservar y el paso
 * «Revisar» fallaba con «No pudimos verificar el precio on-chain»: un mensaje de red para un
 * problema de inventario. La corrección tiene dos mitades y esta prueba fija ambas:
 *   1. `filterSoldOnChain` retira lo que el contrato confirma vendido (`soldOnce == true`) y
 *      CONSERVA lo que no pudo comprobar (un pico de red no debe ocultar inventario sano).
 *   2. El camino de BD de `fetchCatalog` pasa por ese filtro (invariante estructural sobre el
 *      código real, mismo estilo que `paused-guardian`).
 */

const night = (tokenId: string): NightView => ({
  tokenId,
  room: 101,
  dateYYYYMMDD: 20261015,
  type: "simple",
  priceWei: "50000000000000000",
  saleType: "PRIMARY",
});

describe("classifySoldOnce (§35: tres estados, sin colapsar «no se pudo leer»)", () => {
  it("true → sold; false → free; null → unknown", () => {
    expect(classifySoldOnce(true)).toBe("sold");
    expect(classifySoldOnce(false)).toBe("free");
    expect(classifySoldOnce(null)).toBe("unknown");
  });
});

describe("filterSoldOnChain (§35: la autoridad es el contrato, no el índice)", () => {
  it("retira SOLO las noches que el contrato confirma vendidas", async () => {
    const answer = async (id: bigint): Promise<boolean> => id === BigInt("10120261027");
    const kept = await filterSoldOnChain(
      [night("10120261027"), night("10120261028")],
      { soldOnce: answer },
    );
    expect(kept.map((n) => n.tokenId)).toEqual(["10120261028"]);
  });

  it("un fallo de lectura PUNTUAL conserva la noche (falla en abierto, resiliencia)", async () => {
    const failing = async (id: bigint): Promise<boolean> => {
      if (id === BigInt("10120261027")) throw new Error("RPC timeout");
      return false;
    };
    const kept = await filterSoldOnChain([night("10120261027"), night("10120261028")], {
      soldOnce: failing,
    });
    expect(kept).toHaveLength(2);
  });

  it("la lista vacía no consulta la red", async () => {
    const soldOnce = vi.fn(async () => true);
    const kept = await filterSoldOnChain([], { soldOnce });
    expect(kept).toEqual([]);
    expect(soldOnce).not.toHaveBeenCalled();
  });
});

describe("fetchCatalog usa el guardón on-chain en el camino de BD (estructural)", () => {
  const source = readFileSync(fileURLToPath(new URL("./nights.ts", import.meta.url)), "utf8");

  it("el resultado de BD pasa por filterSoldOnChain antes de devolverse", () => {
    // FALSO POSITIVO EVITADO: la llamada debe estar en el bloque de BD (después del sort del
    // `fromDb`), no solo definida en el fichero.
    expect(source).toMatch(/return await filterSoldOnChain\(fromDb\)/);
  });

  it("el lector real usa `soldOnce` sobre el contrato canónico", () => {
    expect(source).toContain('functionName: "soldOnce"');
    expect(source).toContain("contractAddress");
  });
});
