import { describe, expect, it } from "vitest";
import { resaleErrorMessage } from "./resaleErrorMessage";

/** Construye un error tipo viem con nombre de revert en `shortMessage` y cadena de `cause`. */
function viemRevert(errorName: string): Error {
  const inner = Object.assign(new Error(`reverted with ${errorName}()`), {
    shortMessage: `The contract function "list" reverted with the following reason: ${errorName}()`,
  });
  return Object.assign(new Error("Transaction failed"), { cause: inner });
}

describe("resaleErrorMessage (mapeo de errores de reventa, CU-06)", () => {
  it("mapea NotOwner a su mensaje específico", () => {
    expect(resaleErrorMessage(viemRevert("NotOwner"))).toBe("resaleError.NotOwner");
  });

  it("mapea InvalidPrice a su mensaje específico", () => {
    expect(resaleErrorMessage(viemRevert("InvalidPrice"))).toBe("resaleError.InvalidPrice");
  });

  it("mapea NightExpired a su mensaje específico", () => {
    expect(resaleErrorMessage(viemRevert("NightExpired"))).toBe("resaleError.NightExpired");
  });

  it("mapea NotListed a su mensaje específico", () => {
    expect(resaleErrorMessage(viemRevert("NotListed"))).toBe("resaleError.NotListed");
  });

  it("detecta el error aunque aparezca en un nivel profundo de cause", () => {
    const deep = { cause: { cause: { message: "execution reverted: NightExpired(123)" } } };
    expect(resaleErrorMessage(deep)).toBe("resaleError.NightExpired");
  });

  it("cae al rechazo de firma cuando el usuario cancela (code 4001)", () => {
    const rejected = { cause: { name: "UserRejectedRequestError", code: 4001 } };
    expect(resaleErrorMessage(rejected)).toBe("txError.rejected");
  });

  it("cae al fallo genérico cuando el revert no es reconocido", () => {
    expect(resaleErrorMessage(viemRevert("SomethingElse"))).toBe("txError.failed");
  });

  it("cae al fallo genérico con un error sin información", () => {
    expect(resaleErrorMessage(new Error("boom"))).toBe("txError.failed");
  });
});
