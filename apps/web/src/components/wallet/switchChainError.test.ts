import { describe, expect, it } from "vitest";
import { classifySwitchChainError } from "./switchChainError";

describe("classifySwitchChainError (RF-04, manejo del cambio de red)", () => {
  it("detecta la red no añadida (EIP-1193 4902)", () => {
    expect(classifySwitchChainError({ code: 4902 })).toBe("chainNotAdded");
  });

  it("detecta 4902 anidado en la cadena de cause (wagmi/viem)", () => {
    const error = { cause: { cause: { code: 4902 } } };
    expect(classifySwitchChainError(error)).toBe("chainNotAdded");
  });

  it("detecta el rechazo del usuario por code 4001", () => {
    expect(classifySwitchChainError({ code: 4001 })).toBe("rejected");
  });

  it("detecta el rechazo del usuario por UserRejectedRequestError", () => {
    expect(classifySwitchChainError({ name: "UserRejectedRequestError" })).toBe("rejected");
  });

  it("prioriza 4902 sobre el rechazo si aparece antes en la cadena", () => {
    const error = { code: 4902, cause: { code: 4001 } };
    expect(classifySwitchChainError(error)).toBe("chainNotAdded");
  });

  it("cae a «failed» para errores desconocidos", () => {
    expect(classifySwitchChainError(new Error("boom"))).toBe("failed");
    expect(classifySwitchChainError(undefined)).toBe("failed");
  });
});
