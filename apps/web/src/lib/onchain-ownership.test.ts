import { describe, expect, it, vi } from "vitest";
import { readOnChainOwnership, type OwnershipReader } from "./onchain-ownership";

const OWNER = "0x1111111111111111111111111111111111111111" as const;

const reader = (impl: () => Promise<typeof OWNER>): OwnershipReader => ({ ownerOf: impl });

/** Error con la forma de un revert de contrato tal y como lo envuelve viem. */
const revertError = (): Error =>
  Object.assign(new Error("execution reverted"), {
    name: "ContractFunctionExecutionError",
    cause: Object.assign(new Error("ERC721NonexistentToken"), {
      name: "ContractFunctionRevertedError",
    }),
  });

describe("readOnChainOwnership (M7: la cadena es la autoridad de la titularidad)", () => {
  it("el contrato responde un propietario → estado `owner`", async () => {
    const result = await readOnChainOwnership("10120260815", reader(async () => OWNER));
    expect(result).toEqual({ status: "owner", owner: OWNER });
  });

  it("revert de `ownerOf` (token quemado o inexistente) → `missing`, que es una respuesta", async () => {
    const result = await readOnChainOwnership(
      "10120260815",
      reader(async () => {
        throw revertError();
      }),
    );
    expect(result.status).toBe("missing");
  });

  it("fallo de red/RPC → `unavailable` (no se asume que el índice tenía razón)", async () => {
    const result = await readOnChainOwnership(
      "10120260815",
      reader(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8545");
      }),
    );
    expect(result).toEqual({
      status: "unavailable",
      reason: "connect ECONNREFUSED 127.0.0.1:8545",
    });
  });

  it("un `tokenId` que no es un número entero no puede existir → `missing` sin consultar la red", async () => {
    const ownerOf = vi.fn(async () => OWNER);
    const result = await readOnChainOwnership("no-soy-un-token", { ownerOf });
    expect(result.status).toBe("missing");
    expect(ownerOf).not.toHaveBeenCalled();
  });
});
