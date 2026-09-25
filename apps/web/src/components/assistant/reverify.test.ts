import { describe, expect, it } from "vitest";
import { buildPurchaseTxData } from "@hotel/shared/domain";
import { reverifyPurchase } from "./reverify";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CHAIN_ID = 31337;
const TOKEN = 10220260615n;
const PRICE = 50_000_000_000_000_000n;

const tx = buildPurchaseTxData({ tokenId: TOKEN, priceWei: PRICE, saleType: "PRIMARY", contractAddress: CONTRACT, chainId: CHAIN_ID });

const base = {
  tx,
  expectedTokenId: TOKEN,
  expectedContract: CONTRACT,
  expectedChainId: CHAIN_ID,
  onChainPriceWei: PRICE,
} as const;

describe("reverifyPurchase (re-verificación cliente, RNF-19/TC-E2E-030)", () => {
  it("acepta cuando value == precio on-chain y to/chainId/tokenId coinciden", () => {
    expect(reverifyPurchase(base)).toMatchObject({ ok: true, tokenId: TOKEN, functionName: "buy" });
  });

  it("rechaza si el precio on-chain difiere del value (anti-tampering)", () => {
    const r = reverifyPurchase({ ...base, onChainPriceWei: PRICE + 1n });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("value≠precio");
  });

  it("rechaza si el tokenId del calldata no coincide con el que afirma el servidor", () => {
    const r = reverifyPurchase({ ...base, expectedTokenId: TOKEN + 1n });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("tokenId≠pedido");
    expect(r.tokenId).toBe(TOKEN); // expone el tokenId REAL del calldata
  });

  it("rechaza si la cadena no es la esperada", () => {
    const r = reverifyPurchase({ ...base, expectedChainId: 1 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("chainId≠esperado");
  });

  it("rechaza si el destino no es el contrato esperado", () => {
    const r = reverifyPurchase({ ...base, expectedContract: "0x0000000000000000000000000000000000000001" });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("to≠contrato");
  });
});
