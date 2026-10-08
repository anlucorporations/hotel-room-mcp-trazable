import { describe, expect, it } from "vitest";
import { parseColorUtilities, tokenHex } from "./color-usage";

/**
 * Parser de utilidades de color del sistema de diseño. Se prueban las formas que **no** pintan color
 * (estructura) y las que sí, porque de ello depende la auditoría de contraste.
 */
describe("parseColorUtilities — utilidades que no pintan color", () => {
  it("ignora una utilidad sin token (`bg` a secas)", () => {
    expect(parseColorUtilities("bg")).toEqual([]);
  });

  it("ignora la estructura del anillo y del degradado, y la elevación", () => {
    expect(parseColorUtilities("ring-2 ring-offset-2 bg-gradient-to-br shadow-card")).toEqual([]);
  });

  it("ignora un lado sin color (`border-b`, `border-y`)", () => {
    expect(parseColorUtilities("border-b border-y")).toEqual([]);
  });
});

describe("parseColorUtilities — formas que sí pintan", () => {
  it("resuelve el color de un borde por lado y las variantes", () => {
    const utilidades = parseColorUtilities("border-t-azure hover:bg-surface");

    expect(utilidades.length).toBeGreaterThan(0);
  });

  it("separa el color de la opacidad cuando se indica con barra", () => {
    const utilidades = parseColorUtilities("bg-ink/50");

    expect(utilidades.length).toBeGreaterThan(0);
  });
});

describe("tokenHex", () => {
  it("devuelve el hex de la paleta y descarta un token desconocido", () => {
    expect(tokenHex("azure")).toMatch(/^#[0-9A-F]{6}$/i);
    expect(tokenHex("token-que-no-existe")).toBeNull();
  });
});
