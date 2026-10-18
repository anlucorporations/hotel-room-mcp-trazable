import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

/**
 * `canonicalJson` es la base de dos garantías: la cadena de auditoría no detectable como manipulada y
 * el `payloadHash` EIP-712 reproducible. Se movió aquí desde `db/repositories/audit.repository.ts`
 * (que la reexporta), así que estos casos fijan el comportamiento **tal cual era**: mover el código no
 * puede cambiar ningún hash ya persistido.
 */
describe("canonicalJson · serialización determinista", () => {
  it("ordena las claves en profundidad (mismo contenido, distinto orden ⇒ mismo texto)", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
  });

  it("produce exactamente el JSON esperado, sin espacios", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });

  it("ignora las claves indefinidas y distingue `null` de ausente", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it("respeta el orden de los arrays (una lista no es un conjunto)", () => {
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("serializa los escalares como `JSON.stringify` y `undefined` como `null`", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("a\"b")).toBe('"a\\"b"');
    expect(canonicalJson(true)).toBe("true");
  });

  it("no depende del orden de inserción de claves anidadas", () => {
    const a = canonicalJson({ z: { y: 1, x: 2 }, a: [{ b: 1, c: 2 }] });
    const b = canonicalJson({ a: [{ c: 2, b: 1 }], z: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });
});
