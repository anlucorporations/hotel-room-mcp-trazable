import { describe, expect, it } from "vitest";
import { catalogSearchOf, derivePageAction, pageActionForTurn, type AssistantToolCall } from "./page-action";

/**
 * La consulta del asistente se convierte en la navegación que **muestra el resultado en la página**
 * (incremento v4: «todas las habitaciones sencillas» → `/catalogo?tipo=simple`). Estas pruebas fijan
 * las dos garantías del diseño: se deriva de la **entrada real** de la herramienta (no de la prosa
 * del modelo) y solo navegan las herramientas de catálogo.
 */

const list = (input: Record<string, unknown> = {}): AssistantToolCall => ({
  name: "listAvailableNights",
  input,
});

describe("catalogSearchOf", () => {
  it("traduce el filtro por tipo de `listAvailableNights`", () => {
    expect(catalogSearchOf(list({ type: "simple" }))).toEqual({
      type: "simple",
      from: "",
      to: "",
      room: "",
    });
  });

  it("traduce la ventana de fechas del MCP a ISO", () => {
    expect(catalogSearchOf(list({ type: "suite", window: { from: 20260601, to: 20260630 } }))).toEqual(
      { type: "suite", from: "2026-06-01", to: "2026-06-30", room: "" },
    );
  });

  it("ordena una ventana invertida en lugar de dejar un rango imposible", () => {
    expect(catalogSearchOf(list({ window: { from: 20260630, to: 20260601 } }))).toEqual({
      type: null,
      from: "2026-06-01",
      to: "2026-06-30",
      room: "",
    });
  });

  it("ignora una ventana o un tipo con forma inválida", () => {
    expect(catalogSearchOf(list({ type: "triple", window: "junio" }))).toEqual({
      type: null,
      from: "",
      to: "",
      room: "",
    });
    expect(catalogSearchOf(list({ window: { from: "ayer", to: null } }))?.from).toBe("");
    expect(catalogSearchOf(list({ window: null }))?.to).toBe("");
  });

  it("una noche concreta acota el catálogo a ese día y esa habitación", () => {
    expect(catalogSearchOf({ name: "checkAvailability", input: { room: 12, date: 20260622 } })).toEqual(
      { type: null, from: "2026-06-22", to: "2026-06-22", room: "12" },
    );
    // Entradas sin forma: se descartan en vez de propagar basura a la URL.
    expect(catalogSearchOf({ name: "checkAvailability", input: { room: {}, date: "hoy" } })).toEqual({
      type: null,
      from: "",
      to: "",
      room: "",
    });
    expect(
      catalogSearchOf({ name: "checkAvailability", input: { room: "12", date: 20260622 } })?.room,
    ).toBe("12");
  });

  it("las herramientas que no consultan catálogo no implican navegación", () => {
    expect(catalogSearchOf({ name: "searchHotelManuals", input: { query: "desayuno" } })).toBeNull();
    expect(catalogSearchOf({ name: "buildPurchaseTx", input: { tokenId: "1" } })).toBeNull();
  });
});

describe("derivePageAction", () => {
  it("sin consultas de catálogo no mueve la pantalla", () => {
    expect(derivePageAction([])).toBeNull();
    expect(derivePageAction([{ name: "searchHotelManuals", input: { query: "spa" } }])).toBeNull();
  });

  it("una consulta por tipo lleva al catálogo filtrado", () => {
    expect(derivePageAction([list({ type: "simple" })])).toEqual({
      kind: "catalog",
      href: "/catalogo?tipo=simple",
      search: { type: "simple", from: "", to: "", room: "" },
    });
  });

  it("si el modelo encadena consultas, manda la última (la que responde al usuario)", () => {
    const action = derivePageAction([
      list({ type: "simple" }),
      { name: "getOwnedNights", input: { wallet: "0xabc" } },
      list({ type: "suite", window: { from: 20260601, to: 20260630 } }),
    ]);
    expect(action?.href).toBe("/catalogo?tipo=suite&desde=2026-06-01&hasta=2026-06-30");
  });

  it("una consulta de disponibilidad sin filtros abre el catálogo entero", () => {
    expect(derivePageAction([list()])?.href).toBe("/catalogo");
  });

  it("la consulta puntual de una noche navega con ese día y esa habitación", () => {
    expect(
      derivePageAction([{ name: "checkAvailability", input: { room: 7, date: 20260622 } }])?.href,
    ).toBe("/catalogo?desde=2026-06-22&hasta=2026-06-22&buscar=7");
  });
});

describe("pageActionForTurn — prioridad del handoff", () => {
  const calls: AssistantToolCall[] = [
    { name: "checkAvailability", input: { room: 101, date: 20261013 } },
    { name: "buildPurchaseTx", input: { tokenId: "10120261013" } },
  ];

  it("si el turno preparó una compra NO se navega (el panel de firma manda)", () => {
    // Defecto medido en producción el 2026-10-10: el flujo correcto de compra usa checkAvailability
    // (herramienta de catálogo) y buildPurchaseTx, así que el widget navegaba al catálogo y cerraba
    // el panel en el mismo turno, y el usuario nunca veía la compra preparada.
    expect(pageActionForTurn({ toolCalls: calls, preparedPurchase: { tokenId: "10120261013" } })).toBeNull();
  });

  it("sin compra preparada, la consulta de catálogo navega como siempre", () => {
    expect(pageActionForTurn({ toolCalls: calls, preparedPurchase: null })?.href).toBe(
      "/catalogo?desde=2026-10-13&hasta=2026-10-13&buscar=101",
    );
    expect(pageActionForTurn({ toolCalls: [], preparedPurchase: null })).toBeNull();
  });
});
