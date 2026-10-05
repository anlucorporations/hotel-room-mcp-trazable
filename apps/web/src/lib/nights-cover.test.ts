import { describe, expect, it } from "vitest";
import { withCoverUrls, type NightView } from "./nights";

/**
 * Guardián del catálogo (2026-10-05): **la tarjeta debe mostrar la foto de SU habitación**.
 *
 * Antes la tarjeta pintaba siempre un placeholder por tipo, así que el catálogo no enseñaba la foto
 * de la habitación en venta. La resolución vive en `withCoverUrls` y esta prueba fija las dos reglas
 * que importan: si la habitación tiene portada se usa esa, y si no la tiene **no se enseña la de
 * otra** (`null` → la tarjeta cae a su imagen de reserva).
 */
const night = (overrides: Partial<NightView> = {}): NightView => ({
  tokenId: "1",
  room: 101,
  dateYYYYMMDD: 20261020,
  type: "doble",
  priceWei: "100000000000000000",
  saleType: "PRIMARY",
  ...overrides,
});

describe("withCoverUrls", () => {
  it("usa la portada de la habitación de esa noche", () => {
    const covers = new Map([[101, { fileName: "101-Doble-2026-10-05-1.jpg" }]]);
    const [result] = withCoverUrls([night()], covers);
    expect(result?.coverUrl).toBe("/api/rooms/images/101-Doble-2026-10-05-1.jpg");
  });

  it("no enseña la foto de otra habitación si la suya no tiene portada", () => {
    const covers = new Map([[202, { fileName: "202-Suite-2026-10-05-1.jpg" }]]);
    const [result] = withCoverUrls([night({ room: 101 })], covers);
    expect(result?.coverUrl).toBeNull();
  });

  it("devuelve copias (no muta las noches de entrada)", () => {
    const original = night();
    const [result] = withCoverUrls([original], new Map());
    expect(result).not.toBe(original);
    expect(original.coverUrl).toBeUndefined();
  });

  it("cada noche recibe la portada de la suya, no la primera del mapa", () => {
    const covers = new Map([
      [101, { fileName: "101-Doble-2026-10-05-1.jpg" }],
      [305, { fileName: "305-Suite-2026-10-05-1.jpg" }],
    ]);
    const result = withCoverUrls([night({ room: 305 }), night({ tokenId: "2", room: 101 })], covers);
    expect(result.map((entry) => entry.coverUrl)).toEqual([
      "/api/rooms/images/305-Suite-2026-10-05-1.jpg",
      "/api/rooms/images/101-Doble-2026-10-05-1.jpg",
    ]);
  });

  it("sin noches devuelve una lista vacía", () => {
    expect(withCoverUrls([], new Map())).toEqual([]);
  });
});
