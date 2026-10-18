import { describe, expect, it } from "vitest";
import { actionTypeHash, entityIdOf, uuidToBytes16 } from "./entity-id";

/**
 * Vector de regresión de `entityId` (DT-AUD-03,
 * `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2.1). Una divergencia en el encoding cambia
 * el digest y la firma deja de verificar on-chain: por eso los valores esperados son literales del
 * documento y no se recalculan aquí.
 */
describe("entityIdOf · vector canónico", () => {
  it("bloqueo de habitación", () => {
    expect(entityIdOf("ROOM_BLOCK", "3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "0x5c41210b06cc3b609178b5590a2e82a14824789eedc3e40e39de005661e08d0e",
    );
  });

  it("log de área", () => {
    expect(entityIdOf("AREA_LOG", "b1e6c0de-2b2a-4b1e-8f1a-77c9a1d2e345")).toBe(
      "0x09f1dea7a637aea2c77c43b701af27dd15b522cbed34215ae13d0033aad21800",
    );
  });

  it("el mismo UUID con distinta acción da un entityId distinto", () => {
    expect(entityIdOf("ROOM_BLOCK", "3f2504e0-4f89-11d3-9a0c-0305e82c3301")).not.toBe(
      entityIdOf("ROOM_UNBLOCK", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    );
  });
});

describe("actionTypeHash", () => {
  it("es keccak256 del literal ASCII (la constante que usa el contrato)", () => {
    expect(actionTypeHash("ROOM_BLOCK")).toBe(
      "0xa92014e0e46ca6c4c19e780926f57945e3ba96e6cb8044cad4f41ee52ceab705",
    );
  });

  it("es determinista y estable entre llamadas", () => {
    expect(actionTypeHash("CONFIG")).toBe(actionTypeHash("CONFIG"));
  });
});

describe("uuidToBytes16", () => {
  it("quita los guiones y no reordena ningún byte", () => {
    expect(uuidToBytes16("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "0x3f2504e04f8911d39a0c0305e82c3301",
    );
  });

  it("normaliza a minúsculas (PostgreSQL puede devolver el UUID en mayúsculas)", () => {
    expect(uuidToBytes16("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(
      "0x3f2504e04f8911d39a0c0305e82c3301",
    );
  });

  it("rechaza un UUID mal formado (no se firma un entityId inventado)", () => {
    expect(() => uuidToBytes16("no-es-un-uuid")).toThrow(/UUID mal formado/);
    expect(() => uuidToBytes16("3f2504e0-4f89-11d3-9a0c-0305e82c330")).toThrow(/UUID mal formado/);
    expect(() => uuidToBytes16("3f2504e04f8911d39a0c0305e82c3301")).toThrow(/UUID mal formado/);
    expect(() => uuidToBytes16("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")).toThrow(/UUID mal formado/);
  });
});
