import { describe, expect, it } from "vitest";
import { classifyAdminTxError } from "./adminTxError";

/** Construye un error tipo viem con nombre de revert en `shortMessage` y cadena de `cause`. */
function viemRevert(errorName: string): Error {
  const inner = Object.assign(new Error(`reverted with ${errorName}()`), {
    shortMessage: `The contract function "withdraw" reverted with the following reason: ${errorName}()`,
  });
  return Object.assign(new Error("Transaction failed"), { cause: inner });
}

describe("classifyAdminTxError (errores REVERT del back-office, MINOR#32/#33)", () => {
  it("mapea NoFunds a su clave específica", () => {
    expect(classifyAdminTxError(viemRevert("NoFunds"))).toBe("noFunds");
  });

  it("mapea EnforcedPause a la clave de pausa", () => {
    expect(classifyAdminTxError(viemRevert("EnforcedPause"))).toBe("paused");
  });

  it("detecta el error aunque aparezca en un nivel profundo de cause", () => {
    const deep = { cause: { cause: { message: "execution reverted: EnforcedPause()" } } };
    expect(classifyAdminTxError(deep)).toBe("paused");
  });

  it("cae al rechazo de firma cuando el usuario cancela (code 4001)", () => {
    const rejected = { cause: { name: "UserRejectedRequestError", code: 4001 } };
    expect(classifyAdminTxError(rejected)).toBe("rejected");
  });

  it("cae al fallo genérico cuando el revert no es reconocido", () => {
    expect(classifyAdminTxError(viemRevert("SomethingElse"))).toBe("failed");
  });

  it("cae al fallo genérico con un error sin información", () => {
    expect(classifyAdminTxError(new Error("boom"))).toBe("failed");
  });
});
