import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { operationsDomain } from "./domain";
import { buildOperationalMessage, deriveActionNonce, operationalTypedData } from "./typed-data";
import { recoverOperationalSigner, verifyOperationalSignature } from "./verify";

/**
 * Verificación off-chain (vNext · F2 · T2.9): la firma se produce con una wallet real de viem
 * (`privateKeyToAccount` + `signTypedData`) y se comprueba que el firmante recuperado es el dueño de
 * la clave. Es el único camino que demuestra que el TypedData que construye la app es exactamente el
 * que verifica el servidor; recalcular el digest con la propia implementación no lo demostraría.
 *
 * `recoverOperationalSigner`/`verifyOperationalSignature` son `async` porque viem carga la librería de
 * curvas con un import dinámico (ver la nota de `verify.ts`).
 */
const ANVIL_ACCOUNT_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_ACCOUNT_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const CONTRACT = "0x0000000000000000000000000000000000000a11" as const;

const account = privateKeyToAccount(ANVIL_ACCOUNT_0);
const other = privateKeyToAccount(ANVIL_ACCOUNT_1);
const domain = operationsDomain(81234, CONTRACT);
const message = buildOperationalMessage({
  actionType: "ROOM_BLOCK",
  entityUuid: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  payload: { reason: "fuga de agua" },
  nonce: deriveActionNonce("nonce-verify-1"),
  deadline: 1793000000n,
});

describe("recoverOperationalSigner", () => {
  it("recupera la dirección que firmó el TypedData", async () => {
    const signature = await account.signTypedData(operationalTypedData(domain, message));
    await expect(recoverOperationalSigner(domain, message, signature)).resolves.toBe(account.address);
  });

  it("una firma de otra clave recupera otra dirección", async () => {
    const signature = await other.signTypedData(operationalTypedData(domain, message));
    await expect(recoverOperationalSigner(domain, message, signature)).resolves.toBe(other.address);
  });
});

describe("verifyOperationalSignature", () => {
  it("es `true` cuando firma el firmante esperado (dirección en cualquier *checksum*)", async () => {
    const signature = await account.signTypedData(operationalTypedData(domain, message));
    await expect(
      verifyOperationalSignature({
        domain,
        message,
        signature,
        expectedSigner: account.address,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyOperationalSignature({
        domain,
        message,
        signature,
        expectedSigner: account.address.toLowerCase() as `0x${string}`,
      }),
    ).resolves.toBe(true);
  });

  it("es `false` cuando firma otra wallet", async () => {
    const signature = await other.signTypedData(operationalTypedData(domain, message));
    await expect(
      verifyOperationalSignature({
        domain,
        message,
        signature,
        expectedSigner: account.address,
      }),
    ).resolves.toBe(false);
  });

  it("es `false` si el mensaje reconstruido no es el firmado (deadline distinto)", async () => {
    const signature = await account.signTypedData(operationalTypedData(domain, message));
    await expect(
      verifyOperationalSignature({
        domain,
        message: { ...message, deadline: message.deadline + 1n },
        signature,
        expectedSigner: account.address,
      }),
    ).resolves.toBe(false);
  });
});
