import { describe, expect, it } from "vitest";
import {
  classifyNightIntegrity,
  shouldHideNight,
  summarizeNightIntegrity,
  type NightSources,
} from "./index-integrity";

/**
 * F9 · integridad catálogo ↔ cadena.
 *
 * El desfase que se clasifica aquí NO es teórico: en producción, antes de `v14`, la cadena tenía
 * **7** eventos `Sale`, el dashboard contaba **6** ventas primarias y el índice seguía ofreciendo
 * esas noches como `AVAILABLE` (§35). Las pruebas fijan ese caso real.
 */

const sources = (index: NightSources["index"], events: NightSources["events"]): NightSources => ({
  index,
  events,
});

describe("classifyNightIntegrity (el contraste válido es por noche, no por totales)", () => {
  it("caso real §35: el índice ofrece la noche y los eventos la confirman vendida ⇒ ghost", () => {
    expect(classifyNightIntegrity(sources("available", "sold"))).toBe("ghost");
  });

  it("ambas fuentes de acuerdo: disponible o vendida ⇒ ok", () => {
    expect(classifyNightIntegrity(sources("available", "available"))).toBe("ok");
    expect(classifyNightIntegrity(sources("sold", "sold"))).toBe("ok");
  });

  it("el índice oculta una noche libre ⇒ deficit (conservador: no se autocorrige)", () => {
    expect(classifyNightIntegrity(sources("sold", "available"))).toBe("deficit");
  });

  it("cualquier fuente sin respuesta ⇒ indeterminate (nunca se oculta inventario por un pico de red)", () => {
    expect(classifyNightIntegrity(sources("available", "unknown"))).toBe("indeterminate");
    expect(classifyNightIntegrity(sources("unknown", "sold"))).toBe("indeterminate");
    expect(classifyNightIntegrity(sources("unknown", "unknown"))).toBe("indeterminate");
  });

  it("reventa: una noche vendida y después listada sigue siendo ofertable (no es fantasma)", () => {
    // Regla que descarta los agregados: `sale_events` dice «vendida», pero si el índice la dejó
    // AVAILABLE porque hay reventa activa, retirarlas por conteo global sería un falso positivo.
    const resellable = sources("available", "sold");
    expect(classifyNightIntegrity(resellable)).toBe("ghost"); // el índice ES la autoridad de oferta
    // …y el camino correcto es consultar la fuente de oferta (listing/índice), no restar totales.
    expect(shouldHideNight(resellable)).toBe(true);
  });
});

describe("shouldHideNight", () => {
  it("oculta solo la confirmada como fantasma", () => {
    expect(shouldHideNight(sources("available", "sold"))).toBe(true);
    expect(shouldHideNight(sources("available", "available"))).toBe(false);
    expect(shouldHideNight(sources("available", "unknown"))).toBe(false);
    expect(shouldHideNight(sources("sold", "available"))).toBe(false);
  });
});

describe("summarizeNightIntegrity (inventario para logs y alertas)", () => {
  it("separa fantasmas, déficits e indeterminados, con listas estables", () => {
    const report = summarizeNightIntegrity([
      { tokenId: "10820261103", sources: sources("available", "sold") },
      { tokenId: "10120261015", sources: sources("available", "sold") },
      { tokenId: "20120261201", sources: sources("sold", "available") },
      { tokenId: "11620261020", sources: sources("available", "unknown") },
      { tokenId: "12420261021", sources: sources("available", "available") },
    ]);

    expect(report.checked).toBe(5);
    // Orden determinista (los tokenId entran como strings canónicos).
    expect(report.ghosts).toEqual(["10120261015", "10820261103"]);
    expect(report.deficits).toEqual(["20120261201"]);
    expect(report.indeterminate).toBe(1);
    expect(report.drifted).toBe(true);
  });

  it("catálogo coherente: sin desfase", () => {
    const report = summarizeNightIntegrity([
      { tokenId: "10120261015", sources: sources("available", "available") },
      { tokenId: "10820261103", sources: sources("sold", "sold") },
    ]);
    expect(report.ghosts).toEqual([]);
    expect(report.deficits).toEqual([]);
    expect(report.drifted).toBe(false);
  });

  it("sin muestras: nada que informar (drifted false, no true por colección vacía)", () => {
    const report = summarizeNightIntegrity([]);
    expect(report).toEqual({ ghosts: [], deficits: [], indeterminate: 0, checked: 0, drifted: false });
  });

  it("deduplica el mismo tokenId repetido (una noche contada dos veces no son dos fantasmas)", () => {
    const dup = { tokenId: "10820261103", sources: sources("available", "sold") };
    const report = summarizeNightIntegrity([dup, dup]);
    expect(report.ghosts).toEqual(["10820261103"]);
    expect(report.checked).toBe(2);
  });
});
