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

describe("clasificación de fallos al leer la titularidad", () => {
  it("un tokenId que no es número se considera inexistente", async () => {
    await expect(readOnChainOwnership("no-es-un-numero")).resolves.toEqual({ status: "missing" });
  });

  it("un revert directo del contrato (sin envoltorio) también es «no existe»", async () => {
    const directo: OwnershipReader = {
      ownerOf: () => Promise.reject(Object.assign(new Error("revert"), { name: "ContractFunctionRevertedError" })),
    };

    await expect(readOnChainOwnership("1", directo)).resolves.toEqual({ status: "missing" });
  });

  it("un fallo de red es «no disponible», no «no existe»", async () => {
    const red: OwnershipReader = { ownerOf: () => Promise.reject(new Error("timeout")) };
    const resultado = await readOnChainOwnership("1", red);

    expect(resultado.status).toBe("unavailable");
  });

  it("resuelve el motivo aunque lo lanzado no sea un Error", async () => {
    const raro: OwnershipReader = { ownerOf: () => Promise.reject("caída sin Error") };
    const resultado = await readOnChainOwnership("1", raro);

    expect(resultado).toMatchObject({ status: "unavailable", reason: "caída sin Error" });
  });
});
