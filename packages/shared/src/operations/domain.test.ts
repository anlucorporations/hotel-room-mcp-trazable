import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  OPERATIONS_DOMAIN_NAME,
  OPERATIONS_DOMAIN_VERSION,
  operationsDomain,
  operationsDomainSeparator,
} from "./domain";

/**
 * Dominio EIP-712 (DT-AUD-03, `RepoTecnico/propuesta_vNext/documento_tecnico.md` §4.2). El
 * `domainSeparator` entra en el digest: si cambia `name`, `version`, `chainId` o el contrato, TODAS
 * las firmas antiguas dejan de verificar. El vector se compara literal contra el documento.
 */
const CONTRACT = "0x0000000000000000000000000000000000000a11" as const;

describe("operationsDomain", () => {
  it("fija nombre y versión del protocolo", () => {
    expect(OPERATIONS_DOMAIN_NAME).toBe("HotelOperations");
    expect(OPERATIONS_DOMAIN_VERSION).toBe("1");
  });

  it("construye el dominio con la red y el contrato recibidos", () => {
    expect(operationsDomain(81234, CONTRACT)).toEqual({
      name: "HotelOperations",
      version: "1",
      chainId: 81234,
      verifyingContract: CONTRACT,
    });
  });
});

describe("operationsDomainSeparator · vector canónico", () => {
  it("coincide con el valor del documento", () => {
    expect(operationsDomainSeparator(81234, CONTRACT)).toBe(
      "0x38a2ca7288022e3bd179e42ff548bdb9d5f78fca2661f228d7b7543f2f8314cc",
    );
  });

  it("coincide con el cálculo EIP-712 hecho a mano (el contrato hashea igual)", () => {
    const typehash = keccak256(
      stringToHex(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
      ),
    );
    const manual = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32,bytes32,bytes32,uint256,address"), [
        typehash,
        keccak256(stringToHex("HotelOperations")),
        keccak256(stringToHex("1")),
        81234n,
        CONTRACT,
      ]),
    );
    expect(operationsDomainSeparator(81234, CONTRACT)).toBe(manual);
  });

  it("cambia si cambia el `chainId` o el contrato", () => {
    const base = operationsDomainSeparator(81234, CONTRACT);
    expect(operationsDomainSeparator(1, CONTRACT)).not.toBe(base);
    expect(operationsDomainSeparator(81234, "0x0000000000000000000000000000000000000b22")).not.toBe(
      base,
    );
  });
});
