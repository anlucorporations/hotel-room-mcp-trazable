import { describe, expect, it } from "vitest";
import { canonicalJson } from "../domain/canonical-json";
import { payloadHashFromCanonicalJson, payloadHashOf } from "./payload";

/**
 * `payloadHash` (DT-AUD-03, `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2.1):
 * `keccak256(actionType ‖ "|" ‖ canonicalJson(payload))`. Aquí se fijan las invariantes que hacen que
 * el hash sea reproducible: misma acción + mismo contenido ⇒ mismo hash, sea cual sea el orden en que
 * se construyeron los objetos.
 */
describe("payloadHashOf", () => {
  it("equivale a hashear el JSON canónico ya serializado", () => {
    const payload = { b: 1, a: { d: 2, c: [3] } };
    expect(payloadHashOf("ROOM_BLOCK", payload)).toBe(
      payloadHashFromCanonicalJson("ROOM_BLOCK", canonicalJson(payload)),
    );
  });

  it("no depende del orden de las claves", () => {
    expect(payloadHashOf("AREA_LOG", { b: 1, a: 2 })).toBe(
      payloadHashOf("AREA_LOG", { a: 2, b: 1 }),
    );
  });

  it("cambia si cambia la acción, el contenido o la posición del separador", () => {
    const base = payloadHashOf("INSPECTION", { result: "OK" });
    expect(payloadHashOf("PREVENTIVE_TASK", { result: "OK" })).not.toBe(base);
    expect(payloadHashOf("INSPECTION", { result: "FAIL" })).not.toBe(base);
    // Una clave que contiene el separador no puede confundirse con la frontera acción|payload.
    expect(payloadHashFromCanonicalJson("INSPECTION", '|{"result":"OK"}')).not.toBe(
      payloadHashFromCanonicalJson("INSPECTION", '{"result":"OK"}'),
    );
  });

  it("devuelve bytes32 en minúsculas", () => {
    expect(payloadHashOf("CONFIG", { key: "x" })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
