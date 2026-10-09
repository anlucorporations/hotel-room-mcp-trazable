import { describe, expect, it } from "vitest";
import {
  buildCatalogHref,
  describeCatalogSearch,
  gridFiltersFromSearch,
  isEmptyCatalogSearch,
  isIsoDate,
  parseCatalogSearch,
  yyyymmddToIso,
} from "./catalog-search";

/** El filtro vacío en formato `CatalogSearch` (el de la URL). */
const NO_SEARCH = { type: null, from: "", to: "", room: "" } as const;

/**
 * Filtros del catálogo transportables por URL (incremento v4). Es el contrato que comparten el
 * asistente (que los escribe en la URL) y la página del catálogo (que los lee), así que se prueba
 * en los dos sentidos: ida (`buildCatalogHref`) y vuelta (`parseCatalogSearch`).
 */
describe("parseCatalogSearch", () => {
  it("sin parámetros devuelve el catálogo entero", () => {
    expect(parseCatalogSearch(undefined)).toEqual(NO_SEARCH);
    expect(isEmptyCatalogSearch(parseCatalogSearch({}))).toBe(true);
  });

  it("lee tipo, fechas y habitación", () => {
    expect(
      parseCatalogSearch({ tipo: "simple", desde: "2026-06-01", hasta: "2026-06-30", buscar: "12" }),
    ).toEqual({ type: "simple", from: "2026-06-01", to: "2026-06-30", room: "12" });
  });

  it("descarta un tipo inexistente en lugar de romper la parrilla", () => {
    expect(parseCatalogSearch({ tipo: "triple" }).type).toBeNull();
    expect(parseCatalogSearch({ tipo: "SUITE" }).type).toBeNull();
  });

  it("descarta fechas mal formadas o imposibles", () => {
    expect(parseCatalogSearch({ desde: "2026-6-1" }).from).toBe("");
    expect(parseCatalogSearch({ desde: "2026-13-01" }).from).toBe("");
    expect(parseCatalogSearch({ hasta: "2026-06-45" }).to).toBe("");
    expect(parseCatalogSearch({ desde: "mañana" }).from).toBe("");
  });

  it("descarta una habitación vacía o desmesurada", () => {
    expect(parseCatalogSearch({ buscar: "" }).room).toBe("");
    expect(parseCatalogSearch({ buscar: "   " }).room).toBe("");
    expect(parseCatalogSearch({ buscar: "123456789" }).room).toBe("");
    expect(parseCatalogSearch({ buscar: " 12 " }).room).toBe("12");
  });

  it("con un parámetro repetido se queda con el primero (sin sorpresas de proxy)", () => {
    expect(parseCatalogSearch({ tipo: ["doble", "suite"] }).type).toBe("doble");
    expect(parseCatalogSearch({ tipo: [] }).type).toBeNull();
  });
});

describe("buildCatalogHref", () => {
  it("sin filtros apunta al catálogo limpio", () => {
    expect(buildCatalogHref(NO_SEARCH)).toBe("/catalogo");
  });

  it("compone la URL con los filtros activos y omite los vacíos", () => {
    expect(buildCatalogHref({ type: "simple", from: "", to: "", room: "" })).toBe(
      "/catalogo?tipo=simple",
    );
    expect(buildCatalogHref({ type: "suite", from: "2026-06-01", to: "2026-06-30", room: "" })).toBe(
      "/catalogo?tipo=suite&desde=2026-06-01&hasta=2026-06-30",
    );
    expect(buildCatalogHref({ type: null, from: "", to: "", room: "12" })).toBe(
      "/catalogo?buscar=12",
    );
  });

  it("ida y vuelta son estables (misma URL ⇒ mismo estado)", () => {
    const href = buildCatalogHref({ type: "doble", from: "2026-08-01", to: "2026-08-31", room: "7" });
    const query = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(parseCatalogSearch(query)).toEqual({
      type: "doble",
      from: "2026-08-01",
      to: "2026-08-31",
      room: "7",
    });
  });
});

describe("yyyymmddToIso", () => {
  it("convierte el formato del MCP al del input de fecha", () => {
    expect(yyyymmddToIso(20260601)).toBe("2026-06-01");
    expect(yyyymmddToIso("20260601")).toBe("2026-06-01");
    expect(yyyymmddToIso("  20260601  ")).toBe("2026-06-01");
  });

  it("rechaza lo que no es una fecha utilizable", () => {
    expect(yyyymmddToIso(2026061)).toBeNull(); // 7 dígitos
    expect(yyyymmddToIso(20261301)).toBeNull(); // mes 13
    expect(yyyymmddToIso(20260632)).toBeNull(); // día 32
    expect(yyyymmddToIso("2026-06-01")).toBeNull(); // ya es ISO
    expect(yyyymmddToIso(20260601.5)).toBeNull(); // no entero
    expect(yyyymmddToIso(undefined)).toBeNull();
    expect(yyyymmddToIso({})).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("acepta fechas plausibles y rechaza el resto", () => {
    expect(isIsoDate("2026-06-01")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(true); // el día exacto lo valida el calendario, no esto
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2026-06-00")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("describeCatalogSearch", () => {
  it("enumera solo los filtros activos, en orden", () => {
    expect(describeCatalogSearch({ type: null, from: "", to: "", room: "" })).toEqual([]);
    expect(
      describeCatalogSearch({ type: "simple", from: "2026-06-01", to: "2026-06-30", room: "12" }),
    ).toEqual([
      { kind: "type", value: "simple" },
      { kind: "dates", value: "2026-06-01|2026-06-30" },
      { kind: "room", value: "12" },
    ]);
    // Un extremo suelto del rango también se describe.
    expect(describeCatalogSearch({ type: null, from: "2026-06-01", to: "", room: "" })).toEqual([
      { kind: "dates", value: "2026-06-01|" },
    ]);
  });
});

describe("gridFiltersFromSearch", () => {
  it("siembra la parrilla con el filtro de la URL y deja mes/precio en blanco", () => {
    expect(gridFiltersFromSearch({ type: "simple", from: "", to: "", room: "" })).toEqual({
      type: "simple",
      month: null,
      maxPriceWei: null,
      dateFrom: "",
      dateTo: "",
      search: "",
    });
    expect(gridFiltersFromSearch({ type: null, from: "", to: "", room: "9" })).toEqual({
      type: "all",
      month: null,
      maxPriceWei: null,
      dateFrom: "",
      dateTo: "",
      search: "9",
    });
  });
});
