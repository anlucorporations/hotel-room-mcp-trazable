import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { classifySoldOnce, excludeGhosts, filterSoldOnChain, type NightView } from "./nights";

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

describe("fetchCatalog: las dos capas del camino de BD (estructural)", () => {
  const source = readFileSync(fileURLToPath(new URL("./nights.ts", import.meta.url)), "utf8");

  it("F9 · capa 1: el catálogo consulta el registro de ventas y proyecta la exclusión", () => {
    // La llamada tiene que estar EN EL BLOQUE DE BD y su resultado consumido: basta con definirla
    // o con invocarla sin usar lo que devuelve para que el guardián quede decorativo.
    expect(source).toMatch(/const ghosts = await nftsRepo\.listGhostPrimarySales\(\)/);
    expect(source).toMatch(/excludeGhosts\(fromDb, ghosts\)/);
    expect(source).toMatch(/withoutGhosts/);
  });

  it("§35 · capa 2: lo que sobrevive a la capa 1 pasa además por la lectura on-chain", () => {
    // Falso positivo evitado (y actualizado en F9): antes se filtraba `fromDb` a secas; ahora la
    // autoridad de BD ya descontó fantasmas y queda la del contrato como segunda comprobación.
    expect(source).toMatch(/await filterSoldOnChain\(withoutGhosts\)/);
  });

  it("el orden es capa 1 → capa 2 (no al revés: sin eso la exclusión estructural no existe)", () => {
    const layerOne = source.indexOf("listGhostPrimarySales()");
    const layerTwo = source.indexOf("filterSoldOnChain(withoutGhosts)");
    expect(layerOne).toBeGreaterThan(-1);
    expect(layerTwo).toBeGreaterThan(layerOne);
  });

  it("el desfase se registra, no se silencia", () => {
    expect(source).toMatch(/console\.warn\(\s*\[?`?\[fetchCatalog\] índice desfasado/);
  });

  it("el lector real usa `soldOnce` sobre el contrato canónico", () => {
    expect(source).toContain('functionName: "soldOnce"');
    expect(source).toContain("contractAddress");
  });
});

describe("excludeGhosts (F9: proyección mecánica de la exclusión resuelta en SQL)", () => {
  it("retira exactamente los tokens confirmados y conserva el resto en orden", () => {
    const nights = [night("10120261015"), night("10820261103"), night("20120261201")];
    const kept = excludeGhosts(nights, [{ tokenId: "10820261103" }]);
    expect(kept.map((n) => n.tokenId)).toEqual(["10120261015", "20120261201"]);
  });

  it("sin fantasmas devuelve la lista íntegra (copia, no la misma referencia)", () => {
    const nights = [night("10120261015")];
    const kept = excludeGhosts(nights, []);
    expect(kept).toEqual(nights);
    expect(kept).not.toBe(nights);
  });

  it("una noche repetida en la lista de fantasmas no duplica ni pierde inventario", () => {
    const nights = [night("10120261015"), night("10820261103")];
    const kept = excludeGhosts(nights, [{ tokenId: "10120261015" }, { tokenId: "10120261015" }]);
    expect(kept.map((n) => n.tokenId)).toEqual(["10820261103"]);
  });

  it("no toca noches que los eventos desconocen (la duda se conserva, §35)", () => {
    const nights = [night("10120261015"), night("99920261015")];
    expect(excludeGhosts(nights, [{ tokenId: "10120261015" }]).map((n) => n.tokenId)).toEqual([
      "99920261015",
    ]);
  });
});
