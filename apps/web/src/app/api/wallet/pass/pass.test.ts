import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { GET as getWalletPass } from "./[tokenId]/route";
import { resetFakeRedis } from "../../../../../test/fake-redis";
import type * as SharedModule from "@hotel/shared";

/** Propietaria de la noche en el registro simulado: cuenta 0 de Anvil (clave de desarrollo). */
const OWNER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const OWNER = privateKeyToAccount(OWNER_PK);
/** Cuenta 1 de Anvil: firma ajena / dueño nuevo para los tests de titularidad (M7). */
const NEW_OWNER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const NEW_OWNER = privateKeyToAccount(NEW_OWNER_PK);
const TOKEN_ID = "10120260720";

/**
 * La titularidad la decide la cadena (M7) y estos tests son HERMÉTICOS: el lector de `ownerOf` se
 * inyecta doblado para no depender de (ni hablar con) la Anvil del desarrollador.
 */
const { mockReadOnChainOwnership } = vi.hoisted(() => ({ mockReadOnChainOwnership: vi.fn() }));
vi.mock("@/lib/onchain-ownership", () => ({
  readOnChainOwnership: mockReadOnChainOwnership,
}));

vi.mock("@hotel/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedModule>();
  return {
    ...actual,
    NFTsRepository: vi.fn().mockImplementation(() => ({
      getNFTById: vi.fn().mockImplementation(async (tokenId: string) => {
        if (tokenId === TOKEN_ID) {
          return {
            tokenId: TOKEN_ID,
            roomNumber: 101,
            roomType: "SIMPLE",
            checkInDate: "2026-07-20",
            checkOutDate: "2026-07-21",
            basePriceWei: "50000000000000000",
            status: "SOLD",
            currentOwner: OWNER.address,
            txHashMint: "0xminttx",
          };
        }
        return null;
      }),
    })),
  };
});

/** Cabeceras EIP-712 firmadas por la propietaria (misma estructura que exige la API). */
async function signedHeaders(signerPk: `0x${string}` = OWNER_PK) {
  const { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES } = await import("@hotel/shared");
  const { activeChain, contractAddress } = await import("@/config/chain");
  const nonce = `nonce-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 120;
  const signer = privateKeyToAccount(signerPk);

  const signature = await signer.signTypedData({
    domain: { ...QR_REDOWNLOAD_DOMAIN, chainId: activeChain.id, verifyingContract: contractAddress },
    types: QR_REDOWNLOAD_TYPES,
    primaryType: "DownloadTicket",
    message: { tokenId: BigInt(TOKEN_ID), nonce, expiresAt: BigInt(expiresAt) },
  });

  return {
    "x-wallet-address": signer.address,
    "x-signature": signature,
    "x-nonce": nonce,
    "x-expires-at": String(expiresAt),
  };
}

describe("Digital Wallet Passes Endpoint (US-12 · D-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeRedis();
    // Por defecto la cadena dice lo mismo que el índice.
    mockReadOnChainOwnership.mockResolvedValue({ status: "owner", owner: OWNER.address });
  });

  it("SIN firma del titular responde 401 (no se entrega el pase de una noche ajena)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`);
    const res = await getWalletPass(req, { params: Promise.resolve({ tokenId: TOKEN_ID }) });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
  });

  it("debe generar estructura de pase Apple Wallet (PassKit) por defecto", async () => {
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`, {
      headers: await signedHeaders(),
    });
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: TOKEN_ID }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("apple");
    expect(data.passData).toBeDefined();
    expect(data.passData.eventTicket.primaryFields[0].value).toBe("101");
    expect(data.passData.barcodes[0].message).toContain("/checkin#ticket=");
    expect(data.downloadUrl).toContain("download=true");
  });

  it("debe devolver binario .pkpass cuando download=true", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple&download=true`,
      { headers: await signedHeaders() },
    );
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: TOKEN_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.apple.pkpass");
    expect(res.headers.get("Content-Disposition")).toContain("hotel_reserva_101.pkpass");
  });

  it("debe generar objeto y Save URL de Google Wallet cuando type=google", async () => {
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=google`, {
      headers: await signedHeaders(),
    });
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: TOKEN_ID }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("google");
    expect(data.saveUrl).toContain("pay.google.com/gp/v/save/hotel_10120260720");
    expect(data.passObject.barcode.value).toContain("/checkin#ticket=");
    expect(data.passObject.state).toBe("ACTIVE");
  });

  it("rechaza una firma que no es del propietario (401)", async () => {
    const { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES } = await import("@hotel/shared");
    const { activeChain, contractAddress } = await import("@/config/chain");
    const stranger = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const nonce = "nonce-ajeno";
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const signature = await stranger.signTypedData({
      domain: { ...QR_REDOWNLOAD_DOMAIN, chainId: activeChain.id, verifyingContract: contractAddress },
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: { tokenId: BigInt(TOKEN_ID), nonce, expiresAt: BigInt(expiresAt) },
    });

    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`, {
      headers: {
        "x-wallet-address": stranger.address,
        "x-signature": signature,
        "x-nonce": nonce,
        "x-expires-at": String(expiresAt),
      },
    });
    const res = await getWalletPass(req, { params: Promise.resolve({ tokenId: TOKEN_ID }) });

    expect(res.status).toBe(401);
  });

  it("debe devolver 404 si el token no existe", async () => {
    const req = new NextRequest("http://localhost:3000/api/wallet/pass/99999999");
    const res = await getWalletPass(req, {
      params: Promise.resolve({ tokenId: "99999999" }),
    });

    expect(res.status).toBe(404);
  });

  it("si la cadena no se puede consultar responde 503 y NO entrega el pase (M7)", async () => {
    mockReadOnChainOwnership.mockResolvedValue({
      status: "unavailable",
      reason: "connect ECONNREFUSED",
    });
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`, {
      headers: await signedHeaders(),
    });
    const res = await getWalletPass(req, { params: Promise.resolve({ tokenId: TOKEN_ID }) });

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("OWNERSHIP_UNVERIFIABLE");
  });

  it("si la cadena dice que el token no existe (quemado) responde 404 (M7)", async () => {
    mockReadOnChainOwnership.mockResolvedValue({ status: "missing" });
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`, {
      headers: await signedHeaders(),
    });
    const res = await getWalletPass(req, { params: Promise.resolve({ tokenId: TOKEN_ID }) });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("TOKEN_NOT_FOUND");
  });

  it("con el índice retrasado manda la CADENA: el pase sale con el dueño on-chain (M7)", async () => {
    mockReadOnChainOwnership.mockResolvedValue({ status: "owner", owner: NEW_OWNER.address });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const req = new NextRequest(`http://localhost:3000/api/wallet/pass/${TOKEN_ID}?type=apple`, {
      headers: await signedHeaders(NEW_OWNER_PK),
    });
    const res = await getWalletPass(req, { params: Promise.resolve({ tokenId: TOKEN_ID }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    const jws = String(data.qrPayload).split("#ticket=")[1] ?? "";
    const payload = JSON.parse(Buffer.from(jws.split(".")[1] ?? "", "base64url").toString("utf8"));
    expect(String(payload.guestWallet).toLowerCase()).toBe(NEW_OWNER.address.toLowerCase());
    expect(warn.mock.calls.flat().join(" ")).toContain("INDEX_OUT_OF_SYNC");
    warn.mockRestore();
  });
});
