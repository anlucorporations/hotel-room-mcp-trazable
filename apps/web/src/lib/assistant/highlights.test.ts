import { describe, expect, it } from "vitest";
import {
  MAX_HIGHLIGHTS,
  highlightsFromToolResult,
  mergeHighlights,
  type NightHighlight,
} from "./highlights";

/**
 * Noches destacadas del turno (formato amigable de la información de habitaciones).
 *
 * Lo que se defiende:
 *   1. Se acepta lo que devuelven de verdad las herramientas (`listAvailableNights` → lista;
 *      `checkAvailability` → objeto con `available`).
 *   2. Nada con forma dudosa entra en la respuesta: un tokenId ausente o un resultado corrupto se
 *      descartan en silencio (la tarjeta sin tokenId no puede preparar nada).
 *   3. El orden es el que hace legible la oferta: fecha → tipo → habitación, sin repetir noches.
 */

const noche = (over: Partial<NightHighlight> = {}): NightHighlight => ({
  tokenId: "10120261012",
  room: 101,
  type: "simple",
  dateYYYYMMDD: 20261012,
  priceWei: "50000000000000000",
  saleType: "PRIMARY",
  ...over,
});

describe("highlightsFromToolResult · listAvailableNights", () => {
  it("normaliza la lista que devuelve la herramienta", () => {
    const resultado = highlightsFromToolResult("listAvailableNights", [
      { tokenId: "10120261012", room: 101, dateYYYYMMDD: 20261012, type: "simple", priceWei: "5", saleType: "PRIMARY" },
      { tokenId: 20220261013, room: "202", dateYYYYMMDD: "20261013", type: "doble", priceWei: 7n },
    ]);

    expect(resultado).toEqual([
      { tokenId: "10120261012", room: 101, type: "simple", dateYYYYMMDD: 20261012, priceWei: "5", saleType: "PRIMARY" },
      { tokenId: "20220261013", room: 202, type: "doble", dateYYYYMMDD: 20261013, priceWei: "7", saleType: null },
    ]);
  });

  it("acepta también la forma `{ nights: [...] }`", () => {
    expect(highlightsFromToolResult("listAvailableNights", { nights: [{ tokenId: "1" }] })).toEqual([
      { tokenId: "1", room: null, type: null, dateYYYYMMDD: null, priceWei: null, saleType: null },
    ]);
  });

  it("descarta lo que no tiene tokenId o no es una noche", () => {
    expect(highlightsFromToolResult("listAvailableNights", [null, 42, { room: 101 }, { tokenId: "" }])).toEqual([]);
    expect(highlightsFromToolResult("listAvailableNights", "no-json")).toEqual([]);
  });
});

describe("highlightsFromToolResult · checkAvailability", () => {
  it("destaca la noche solo si está disponible", () => {
    const disponible = highlightsFromToolResult("checkAvailability", {
      exists: true,
      available: true,
      tokenId: "10120261012",
      priceWei: "50000000000000000",
      saleType: "PRIMARY",
    });
    expect(disponible).toHaveLength(1);
    expect(disponible[0]!.tokenId).toBe("10120261012");

    // No disponible: no hay nada que ofrecer (el texto del asistente explica el motivo).
    expect(
      highlightsFromToolResult("checkAvailability", { exists: true, available: false, tokenId: "10120261012" }),
    ).toEqual([]);
    expect(highlightsFromToolResult("checkAvailability", { exists: false, available: false })).toEqual([]);
  });

  it("ignora las herramientas que no son de catálogo", () => {
    expect(highlightsFromToolResult("getOwnedNights", [{ tokenId: "1" }])).toEqual([]);
    expect(highlightsFromToolResult("buildPurchaseTx", { tokenId: "1" })).toEqual([]);
  });
});

describe("mergeHighlights · orden y sin repeticiones", () => {
  it("ordena por fecha, luego tipo y habitación", () => {
    const mezcladas = mergeHighlights(
      [],
      [
        noche({ tokenId: "b", dateYYYYMMDD: 20261014, type: "suite", room: 301 }),
        noche({ tokenId: "a", dateYYYYMMDD: 20261012, type: "doble", room: 202 }),
        noche({ tokenId: "c", dateYYYYMMDD: 20261012, type: "doble", room: 201 }),
        noche({ tokenId: "d", dateYYYYMMDD: 20261012, type: "simple", room: 101 }),
      ],
    );

    expect(mezcladas.map((n) => n.tokenId)).toEqual(["c", "a", "d", "b"]);
  });

  it("no repite noches entre herramientas del mismo turno", () => {
    const una = mergeHighlights([], [noche({ tokenId: "10120261012" })]);
    const dos = mergeHighlights(una, [noche({ tokenId: "10120261012", priceWei: "999" }), noche({ tokenId: "10120261013", dateYYYYMMDD: 20261013 })]);

    expect(dos).toHaveLength(2);
    // El tokenId repetido conserva el dato que ya se estaba mostrando.
    expect(dos.find((n) => n.tokenId === "10120261012")!.priceWei).toBe("50000000000000000");
  });

  it("acota el número de tarjetas", () => {
    const muchas = Array.from({ length: 12 }, (_, i) =>
      noche({ tokenId: `t${i}`, dateYYYYMMDD: 20261012 + i, room: 100 + i }),
    );
    expect(mergeHighlights([], muchas)).toHaveLength(MAX_HIGHLIGHTS);
    expect(mergeHighlights([], muchas, 3)).toHaveLength(3);
  });

  it("las noches sin fecha van al final (no se pierden)", () => {
    const orden = mergeHighlights([], [noche({ tokenId: "sin-fecha", dateYYYYMMDD: null }), noche({ tokenId: "con-fecha" })]);
    expect(orden.map((n) => n.tokenId)).toEqual(["con-fecha", "sin-fecha"]);
  });
});
