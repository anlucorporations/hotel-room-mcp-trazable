import { describe, expect, it } from "vitest";
import { nightsBetween } from "@hotel/shared";
import {
  bookingSearchParams,
  isIsoDate,
  isoDate,
  MAX_GUESTS,
  nextDay,
  nightsCount,
  parseBookingQuery,
  validateStay,
} from "./booking";

/**
 * Pruebas de las reglas del flujo de reserva (Fase C.2).
 *
 * La prueba clave es la de **convergencia con el servidor**: el recuento de noches que enseña el
 * resumen (`nightsCount`) debe coincidir con `nightsBetween(...).length`, que es el que usa la API
 * para cobrar el anticipo. Sin esa comprobación, un cambio en cualquiera de los dos lados haría que
 * el huésped viera un importe y pagara otro.
 */

const TODAY = "2026-06-01";

describe("noches y fechas", () => {
  it("cuenta las noches como [entrada, salida)", () => {
    expect(nightsCount("2026-06-02", "2026-06-03")).toBe(1);
    expect(nightsCount("2026-06-02", "2026-06-07")).toBe(5);
    expect(nightsCount("2026-06-02", "2026-06-02")).toBe(0);
    expect(nightsCount("2026-06-07", "2026-06-02")).toBe(0);
  });

  it("converge con el cálculo del servidor (el importe que se enseña es el que se cobra)", () => {
    const cases = [
      ["2026-06-02", "2026-06-03"],
      ["2026-06-02", "2026-06-09"],
      ["2026-12-30", "2027-01-02"],
      ["2027-02-27", "2027-03-02"],
    ] as const;
    for (const [from, to] of cases) {
      expect(nightsCount(from, to), `${from} → ${to}`).toBe(nightsBetween(from, to).length);
    }
  });

  it("rechaza fechas con forma correcta pero valor imposible", () => {
    expect(isIsoDate("2026-06-02")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("02/06/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("avanza al día siguiente", () => {
    expect(nextDay("2026-06-01")).toBe("2026-06-02");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("no-es-fecha")).toBe("no-es-fecha");
  });

  it("`isoDate` respeta el desplazamiento en días", () => {
    const now = new Date("2026-06-01T10:00:00Z");
    expect(isoDate(0, now)).toBe("2026-06-01");
    expect(isoDate(1, now)).toBe("2026-06-02");
  });
});

describe("validateStay", () => {
  it("acepta una estancia desde mañana con salida posterior", () => {
    expect(validateStay("2026-06-02", "2026-06-05", TODAY)).toBeNull();
  });

  it("rechaza la noche de hoy: la ventana empieza mañana (D-4)", () => {
    expect(validateStay("2026-06-01", "2026-06-03", TODAY)).toBe("ANTERIOR_A_MANANA");
    expect(validateStay("2026-05-30", "2026-06-03", TODAY)).toBe("ANTERIOR_A_MANANA");
  });

  it("rechaza la salida igual o anterior a la entrada", () => {
    expect(validateStay("2026-06-02", "2026-06-02", TODAY)).toBe("SALIDA_NO_POSTERIOR");
    expect(validateStay("2026-06-05", "2026-06-02", TODAY)).toBe("SALIDA_NO_POSTERIOR");
  });

  it("rechaza fechas mal formadas", () => {
    expect(validateStay("", "2026-06-05", TODAY)).toBe("FECHA_INVALIDA");
    expect(validateStay("2026-06-02", "2026-02-31", TODAY)).toBe("FECHA_INVALIDA");
  });
});

describe("búsqueda transportada en la URL", () => {
  it("serializa solo lo válido", () => {
    const params = bookingSearchParams({ checkInDate: "2026-06-02", checkOutDate: "2026-06-05", guests: 3 });
    expect(params.get("from")).toBe("2026-06-02");
    expect(params.get("to")).toBe("2026-06-05");
    expect(params.get("guests")).toBe("3");

    const partial = bookingSearchParams({ checkInDate: "no-es-fecha", guests: 0 });
    expect([...partial.keys()]).toEqual([]);
  });

  it("lee la URL descartando lo inválido en vez de corregirlo a ciegas", () => {
    expect(parseBookingQuery("?from=2026-06-02&to=2026-06-05&guests=2")).toEqual({
      checkInDate: "2026-06-02",
      checkOutDate: "2026-06-05",
      guests: 2,
    });
    expect(parseBookingQuery("?from=ayer&to=2026-06-05&guests=99")).toEqual({
      checkInDate: undefined,
      checkOutDate: "2026-06-05",
      guests: undefined,
    });
    expect(parseBookingQuery("")).toEqual({
      checkInDate: undefined,
      checkOutDate: undefined,
      guests: undefined,
    });
  });

  it("acota los huéspedes al máximo ofrecido", () => {
    expect(parseBookingQuery(`?guests=${MAX_GUESTS}`).guests).toBe(MAX_GUESTS);
    expect(parseBookingQuery(`?guests=${MAX_GUESTS + 1}`).guests).toBeUndefined();
  });
});
