import { describe, expect, it } from "vitest";
import { encodeFunctionData, toFunctionSelector } from "viem";
import { hotelNightsAbi } from "../abi/hotel-nights";
import {
  buildPurchaseTxData,
  decodePurchaseTx,
  verifyPurchaseTx,
  type PurchaseTxData,
} from "./purchase-tx";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // minúsculas a propósito
const CONTRACT_CHECKSUM = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN_ID = 81234;
const TOKEN = 10220260615n;
const PRICE = 50_000_000_000_000_000n; // 0,05 ETH

describe("buildPurchaseTxData", () => {
  it("PRIMARY codifica el selector de buy(uint256) con el tokenId y el precio", () => {
    const tx = buildPurchaseTxData({
      tokenId: TOKEN,
      priceWei: PRICE,
      saleType: "PRIMARY",
      contractAddress: CONTRACT,
      chainId: CHAIN_ID,
    });
    expect(tx.to).toBe(CONTRACT_CHECKSUM); // checksum normalizado (EIP-55)
    expect(tx.value).toBe(PRICE.toString());
    expect(tx.chainId).toBe(CHAIN_ID);
    expect(tx.data.startsWith(toFunctionSelector("buy(uint256)"))).toBe(true);
    expect(decodePurchaseTx(tx.data)).toEqual({ functionName: "buy", tokenId: TOKEN });
  });

  it("SECONDARY codifica el selector de buyResale(uint256)", () => {
    const tx = buildPurchaseTxData({
      tokenId: TOKEN,
      priceWei: PRICE,
      saleType: "SECONDARY",
      contractAddress: CONTRACT,
      chainId: CHAIN_ID,
    });
    expect(tx.data.startsWith(toFunctionSelector("buyResale(uint256)"))).toBe(true);
    expect(decodePurchaseTx(tx.data)).toEqual({ functionName: "buyResale", tokenId: TOKEN });
  });

  /**
   * D-07: el calldata viaja de la revisión a la firma sin recalcularse. Si el viaje
   * codificar→decodificar→codificar cambiara un byte, lo revisado y lo firmado divergirían.
   */
  it("el calldata sobrevive al viaje codificar→decodificar→codificar byte a byte", () => {
    for (const saleType of ["PRIMARY", "SECONDARY"] as const) {
      const tx = buildPurchaseTxData({
        tokenId: TOKEN,
        priceWei: PRICE,
        saleType,
        contractAddress: CONTRACT,
        chainId: CHAIN_ID,
      });
      const decoded = decodePurchaseTx(tx.data);
      const reencoded = encodeFunctionData({
        abi: hotelNightsAbi,
        functionName: decoded.functionName,
        args: [decoded.tokenId],
      });
      expect(reencoded).toBe(tx.data);
    }
  });
});

describe("decodePurchaseTx", () => {
  it("lanza si el calldata no es una compra", () => {
    const claim = encodeFunctionData({ abi: hotelNightsAbi, functionName: "claim" });
    expect(() => decodePurchaseTx(claim)).toThrow();
  });

  it("lanza con un selector desconocido", () => {
    expect(() => decodePurchaseTx("0xdeadbeef")).toThrow();
  });
});

describe("verifyPurchaseTx", () => {
  const valid: PurchaseTxData = buildPurchaseTxData({
    tokenId: TOKEN,
    priceWei: PRICE,
    saleType: "PRIMARY",
    contractAddress: CONTRACT,
    chainId: CHAIN_ID,
  });
  const base = {
    tx: valid,
    expectedTokenId: TOKEN,
    expectedPriceWei: PRICE,
    expectedContract: CONTRACT,
    expectedChainId: CHAIN_ID,
  } as const;

  it("acepta una tx coherente", () => {
    expect(verifyPurchaseTx(base)).toEqual({ ok: true, reasons: [] });
  });

  it("rechaza un value distinto del precio on-chain (TC-MCP-004)", () => {
    const r = verifyPurchaseTx({ ...base, expectedPriceWei: PRICE + 1n });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("value≠precio");
  });

  it("rechaza un destino distinto del contrato", () => {
    const r = verifyPurchaseTx({
      ...base,
      expectedContract: "0x0000000000000000000000000000000000000001",
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("to≠contrato");
  });

  it("rechaza una cadena inesperada", () => {
    const r = verifyPurchaseTx({ ...base, expectedChainId: 1 });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("chainId≠esperado");
  });

  it("rechaza un tokenId distinto del pedido", () => {
    const r = verifyPurchaseTx({ ...base, expectedTokenId: TOKEN + 1n });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("tokenId≠pedido");
  });

  it("rechaza calldata que no es de compra", () => {
    const claim = encodeFunctionData({ abi: hotelNightsAbi, functionName: "claim" });
    const r = verifyPurchaseTx({ ...base, tx: { ...valid, data: claim } });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("calldata no es buy/buyResale");
  });
});
