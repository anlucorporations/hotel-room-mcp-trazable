import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { buildPurchaseTxData } from "@hotel/shared/domain";
import { createTxValidator } from "./chain-pricing";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const CHAIN_ID = 31337;
const TOKEN = 10220260615n;
const PRICE = 50_000_000_000_000_000n;
const RESALE = 300_000_000_000_000_000n;

interface Reads {
  owner?: boolean;
  soldOnce?: boolean;
  expired?: boolean;
  listing?: { price: bigint; active: boolean };
  price?: bigint;
}

/** `PublicClient` mínimo que responde a los getters que lee `createTxValidator`. */
function fakeClient(r: Reads): PublicClient {
  return {
    readContract: ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "ownerOf":
          if (!r.owner) return Promise.reject(new Error("nonexistent"));
          return Promise.resolve("0x000000000000000000000000000000000000dEaD");
        case "soldOnce":
          return Promise.resolve(r.soldOnce ?? false);
        case "isExpired":
          return Promise.resolve(r.expired ?? false);
        case "listingOf":
          return Promise.resolve(r.listing ?? { price: 0n, active: false });
        case "priceOf":
          return Promise.resolve(r.price ?? 0n);
        default:
          return Promise.reject(new Error(`getter inesperado: ${functionName}`));
      }
    },
  } as unknown as PublicClient;
}

const validate = (r: Reads) => createTxValidator(fakeClient(r), { contractAddress: CONTRACT, chainId: CHAIN_ID });
const primaryTx = buildPurchaseTxData({ tokenId: TOKEN, priceWei: PRICE, saleType: "PRIMARY", contractAddress: CONTRACT, chainId: CHAIN_ID });
const resaleTx = buildPurchaseTxData({ tokenId: TOKEN, priceWei: RESALE, saleType: "SECONDARY", contractAddress: CONTRACT, chainId: CHAIN_ID });

describe("createTxValidator (validación server-side leyendo la cadena, TC-MCP-004)", () => {
  it("acepta una compra primaria coherente con el precio on-chain", async () => {
    expect(await validate({ owner: true, price: PRICE })(TOKEN.toString(), primaryTx)).toEqual({ ok: true, reasons: [] });
  });

  it("acepta una reventa con el precio del listado on-chain", async () => {
    const r = await validate({ owner: true, soldOnce: true, listing: { price: RESALE, active: true }, price: PRICE })(
      TOKEN.toString(),
      resaleTx,
    );
    expect(r.ok).toBe(true);
  });

  it("rechaza si la noche no existe (ownerOf revierte)", async () => {
    expect((await validate({ owner: false })(TOKEN.toString(), primaryTx)).ok).toBe(false);
  });

  it("rechaza si el value no coincide con el precio on-chain (anti-tampering)", async () => {
    const r = await validate({ owner: true, price: PRICE + 1n })(TOKEN.toString(), primaryTx);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("value≠precio");
  });

  it("rechaza si la noche está expirada", async () => {
    expect((await validate({ owner: true, expired: true, price: PRICE })(TOKEN.toString(), primaryTx)).ok).toBe(false);
  });
});
