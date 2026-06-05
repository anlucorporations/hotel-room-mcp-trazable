import { describe, expect, it } from "vitest";
import { buildPurchaseTxData } from "@hotel/shared";
import { verifyPreparedPurchase, type NightPricing } from "./validate-tx";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CHAIN_ID = 81234;
const TOKEN = 10220260615n;
const PRICE = 50_000_000_000_000_000n;
const RESALE = 300_000_000_000_000_000n;

const NONE: NightPricing = {
  exists: false,
  soldOnce: false,
  expired: false,
  listed: false,
  primaryPriceWei: 0n,
  listingPriceWei: 0n,
};
const disponible: NightPricing = { ...NONE, exists: true, primaryPriceWei: PRICE };
const listada: NightPricing = { ...NONE, exists: true, soldOnce: true, listed: true, listingPriceWei: RESALE, primaryPriceWei: PRICE };
const expirada: NightPricing = { ...NONE, exists: true, expired: true };

const primaryTx = buildPurchaseTxData({ tokenId: TOKEN, priceWei: PRICE, saleType: "PRIMARY", contractAddress: CONTRACT, chainId: CHAIN_ID });
const resaleTx = buildPurchaseTxData({ tokenId: TOKEN, priceWei: RESALE, saleType: "SECONDARY", contractAddress: CONTRACT, chainId: CHAIN_ID });

const check = (tx = primaryTx, pricing = disponible) =>
  verifyPreparedPurchase({ tx, tokenId: TOKEN, pricing, contractAddress: CONTRACT, chainId: CHAIN_ID });

describe("verifyPreparedPurchase (validación server-side independiente, TC-MCP-004)", () => {
  it("acepta una compra primaria coherente con el estado on-chain", () => {
    expect(check()).toEqual({ ok: true, reasons: [] });
  });

  it("acepta una reventa con el precio del listado", () => {
    expect(check(resaleTx, listada)).toEqual({ ok: true, reasons: [] });
  });

  it("rechaza si la noche no existe on-chain", () => {
    expect(check(primaryTx, NONE).ok).toBe(false);
  });

  it("rechaza si la noche no es comprable (expirada)", () => {
    const r = check(primaryTx, expirada);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("la noche no es comprable");
  });

  it("rechaza si el value de la tx no coincide con el precio on-chain", () => {
    const tampered = buildPurchaseTxData({ tokenId: TOKEN, priceWei: PRICE + 1n, saleType: "PRIMARY", contractAddress: CONTRACT, chainId: CHAIN_ID });
    const r = check(tampered, disponible);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("value≠precio");
  });

  it("rechaza si el precio de reventa cambió respecto al on-chain", () => {
    // tx construida con el precio antiguo; el listado on-chain vale otra cosa.
    const r = check(resaleTx, { ...listada, listingPriceWei: RESALE + 1n });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("value≠precio");
  });
});
