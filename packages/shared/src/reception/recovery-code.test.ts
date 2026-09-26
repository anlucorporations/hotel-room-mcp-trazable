import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODE_PATTERN,
  normalizeRecoveryCode,
  recoveryCodeForToken,
} from "./recovery-code";

/**
 * D-32 / CU-32: el código de recuperación debe ser estable (mismo token → mismo código), tener el
 * formato `MDS-…` que ya acepta el protocolo de contingencia y poder normalizarse desde lo que
 * teclea recepción.
 */
describe("Código de recuperación de reserva (D-32)", () => {
  it("es determinista para el mismo token", () => {
    expect(recoveryCodeForToken("10120260901")).toBe(recoveryCodeForToken("10120260901"));
  });

  it("distingue tokens distintos", () => {
    expect(recoveryCodeForToken("10120260901")).not.toBe(recoveryCodeForToken("10120260902"));
  });

  it("cumple el formato MDS- y el vocabulario admisible", () => {
    for (const tokenId of ["10120260901", "11620261231", "20120270115", "0xdeadbeef"]) {
      const code = recoveryCodeForToken(tokenId);
      expect(RECOVERY_CODE_PATTERN.test(code), code).toBe(true);
      expect(code).toHaveLength(12); // "MDS-" + 8 caracteres
    }
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(normalizeRecoveryCode("  mds-ab12cd34 ")).toBe("MDS-AB12CD34");
    expect(normalizeRecoveryCode("mds-ab12cd34")).toBe("MDS-AB12CD34");
  });

  it("rechaza códigos con formato inválido", () => {
    expect(normalizeRecoveryCode("")).toBeNull();
    expect(normalizeRecoveryCode("AB12CD34")).toBeNull();
    expect(normalizeRecoveryCode("MDS-")).toBeNull();
    expect(normalizeRecoveryCode("MDS-AB")).toBeNull();
    expect(normalizeRecoveryCode("MDS-AB12CD34!")).toBeNull();
  });
});
