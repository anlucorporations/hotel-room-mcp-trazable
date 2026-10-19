import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_FLAGS,
  effectiveFlagValue,
  isMandatoryFlag,
  parseFlagValue,
  requiresConfigSignature,
} from "./flags";

describe("gobernanza de flags (F9 · T9.3 · D-C22)", () => {
  it("define flags con valor por defecto y obligatoriedad", () => {
    expect(OPERATIONAL_FLAGS.length).toBeGreaterThanOrEqual(3);
    const signs = OPERATIONAL_FLAGS.find((flag) => flag.key === "ENABLE_OPERATIONAL_SIGNATURES");
    expect(signs?.mandatory).toBe(true);
    expect(signs?.defaultValue).toBe("true");
    expect(isMandatoryFlag("ENABLE_OPERATIONAL_SIGNATURES")).toBe(true);
    expect(isMandatoryFlag("INSPECTION_REQUIRES_SIGNATURE")).toBe(false);
  });

  it("solo desactivar un flag obligatorio exige firma CONFIG", () => {
    expect(requiresConfigSignature("ENABLE_OPERATIONAL_SIGNATURES", "true", "false")).toBe(true);
    expect(requiresConfigSignature("ENABLE_OPERATIONAL_SIGNATURES", "false", "true")).toBe(false);
    expect(requiresConfigSignature("INSPECTION_REQUIRES_SIGNATURE", "true", "false")).toBe(false);
  });

  it("normaliza valores y aplica el respaldo", () => {
    expect(parseFlagValue("true")).toBe("true");
    expect(parseFlagValue(true)).toBe("true");
    expect(parseFlagValue("false")).toBe("false");
    expect(parseFlagValue("sí")).toBeNull();
    expect(effectiveFlagValue("ENABLE_OPERATIONAL_SIGNATURES", null)).toBe("true");
    expect(effectiveFlagValue("INSPECTION_REQUIRES_SIGNATURE", null)).toBe("false");
    expect(effectiveFlagValue("DESCONOCIDO", "true")).toBeNull();
  });
});
