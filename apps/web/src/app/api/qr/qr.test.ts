import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { GET as getQR } from "./[tokenId]/route";
import { POST as sendQREmail } from "./[tokenId]/send-email/route";
import { resetFakeRedis } from "../../../../test/fake-redis";
import type * as SharedModule from "@hotel/shared";

const { mockEnqueueEphemeralEmail, mockEnqueueNotification, mockReadOnChainOwnership } = vi.hoisted(
  () => ({
    mockEnqueueEphemeralEmail: vi.fn().mockResolvedValue("ephemeral_12345"),
    mockEnqueueNotification: vi.fn().mockResolvedValue("notif_12345"),
    mockReadOnChainOwnership: vi.fn(),
  }),
);

/**
 * La titularidad la decide la cadena (M7). Estos tests son HERMÉTICOS: nunca abren una conexión
 * real, así que el lector de `ownerOf` se inyecta doblado. Si no se doblara, el test hablaría con
 * la Anvil del desarrollador y su resultado dependería del estado de esa cadena.
 */
vi.mock("@/lib/onchain-ownership", () => ({
  readOnChainOwnership: mockReadOnChainOwnership,
}));

/** Propietaria de la noche en el registro simulado: cuenta 0 de Anvil (clave de desarrollo). */
const OWNER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const OWNER = privateKeyToAccount(OWNER_PK);
/** Cuenta 1 de Anvil: el «propietario nuevo» para probar el índice retrasado (M7). */
const NEW_OWNER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const NEW_OWNER = privateKeyToAccount(NEW_OWNER_PK);
const TOKEN_ID = "10120260720";

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
    NotificationQueueService: vi.fn().mockImplementation(() => ({
      enqueueEphemeralEmail: mockEnqueueEphemeralEmail,
      enqueueNotification: mockEnqueueNotification,
    })),
  };
});

/** Cabeceras EIP-712 válidas firmadas por la propietaria (el mismo mensaje que espera la API). */
async function signedHeaders(
  tokenId: string = TOKEN_ID,
  overrides: { nonce?: string; expiresAt?: number; signerPk?: `0x${string}` } = {},
) {
  const { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES } = await import("@hotel/shared");
  const { activeChain, contractAddress } = await import("@/config/chain");
  const nonce = overrides.nonce ?? `nonce-${Math.random().toString(36).slice(2)}`;
  const expiresAt = overrides.expiresAt ?? Math.floor(Date.now() / 1000) + 120;
  const signer = privateKeyToAccount(overrides.signerPk ?? OWNER_PK);

  const signature = await signer.signTypedData({
    domain: { ...QR_REDOWNLOAD_DOMAIN, chainId: activeChain.id, verifyingContract: contractAddress },
    types: QR_REDOWNLOAD_TYPES,
    primaryType: "DownloadTicket",
    message: { tokenId: BigInt(tokenId), nonce, expiresAt: BigInt(expiresAt) },
  });

  return {
    "x-wallet-address": signer.address,
    "x-signature": signature,
    "x-nonce": nonce,
    "x-expires-at": String(expiresAt),
  };
}

/** Payload del JWS compacto (segundo segmento, base64url): el `guestWallet` que se emitió. */
function jwsPayload(jws: string): { guestWallet?: string } {
  const segment = jws.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as { guestWallet?: string };
}

describe("QR Ticket Endpoints (US-10 & US-12 · D-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFakeRedis();
    // Por defecto la cadena dice lo mismo que el índice.
    mockReadOnChainOwnership.mockResolvedValue({ status: "owner", owner: OWNER.address });
  });

  describe("GET /api/qr/:tokenId", () => {
    it("SIN firma EIP-712 responde 401 y no emite resguardo (cierre de H-05)", async () => {
      const res = await getQR(new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`), {
        params: Promise.resolve({ tokenId: TOKEN_ID }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
      expect(data.qrPayload).toBeUndefined();
    });

    it("con la firma del titular emite el payload QR con ticket JWS (#ticket=)", async () => {
      const headers = await signedHeaders();
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tokenId).toBe(TOKEN_ID);
      expect(data.qrPayload).toContain("/checkin#ticket=");
    });

    it("rechaza una firma ajena a la propietaria (401)", async () => {
      const headers = await signedHeaders(TOKEN_ID, { signerPk: NEW_OWNER_PK });
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(401);
    });

    it("si la cadena no se puede consultar responde 503 y NO emite resguardo (M7)", async () => {
      mockReadOnChainOwnership.mockResolvedValue({
        status: "unavailable",
        reason: "connect ECONNREFUSED",
      });
      const headers = await signedHeaders();
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("OWNERSHIP_UNVERIFIABLE");
    });

    it("si la cadena dice que el token no existe (quemado) responde 404 (M7)", async () => {
      mockReadOnChainOwnership.mockResolvedValue({ status: "missing" });
      const headers = await signedHeaders();
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("TOKEN_NOT_FOUND");
    });

    it("con el índice retrasado manda la CADENA: el ticket se emite al dueño on-chain (M7)", async () => {
      // El índice sigue diciendo que es de OWNER; la cadena ya dice que es de NEW_OWNER.
      mockReadOnChainOwnership.mockResolvedValue({ status: "owner", owner: NEW_OWNER.address });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const headers = await signedHeaders(TOKEN_ID, { signerPk: NEW_OWNER_PK });

      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      const jws = String(data.qrPayload).split("#ticket=")[1] ?? "";
      expect(jwsPayload(jws).guestWallet?.toLowerCase()).toBe(NEW_OWNER.address.toLowerCase());

      // Y el desajuste queda registrado en lugar de silenciarse.
      expect(warn.mock.calls.flat().join(" ")).toContain("INDEX_OUT_OF_SYNC");
      warn.mockRestore();
    });

    it("RF-07: devuelve el resguardo listo para pantalla (QR, token y datos de la noche)", async () => {
      const headers = await signedHeaders();
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      // El token firmado viaja en la respuesta y es el MISMO que codifica el QR: sin esto, la
      // superficie de compra no podría mostrar un resguardo que recepción pueda canjear. El host de
      // la URL lo pone la petición, así que se comprueba la forma y el token, no el dominio.
      expect(typeof data.jws).toBe("string");
      expect(String(data.qrPayload)).toMatch(/^https?:\/\/[^/]+\/checkin#ticket=/);
      expect(String(data.qrPayload).endsWith(String(data.jws))).toBe(true);

      // La imagen del QR es un PNG embebido (no una URL a un servicio externo).
      expect(String(data.qrDataUrl).startsWith("data:image/png;base64,")).toBe(true);
      const base64 = String(data.qrDataUrl).split(",")[1] ?? "";
      const bytes = Buffer.from(base64, "base64");
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(bytes.length).toBeGreaterThan(500);

      // Y los datos que la pantalla muestra al huésped.
      expect(data.tokenId).toBe(TOKEN_ID);
      expect(data.roomNumber).toBe(101);
      expect(data.checkInDate).toBe("2026-07-20");
      expect(typeof data.expiresAt).toBe("string");
    });

    it("RF-07: el QR se puede dibujar para un resguardo real sin recortar el token", async () => {
      // El JWS de un resguardo real ronda el medio millar de caracteres: si el QR se generara con un
      // nivel de corrección o un tamaño insuficiente, `toDataURL` fallaría y el resguardo saldría sin
      // imagen (la ruta lo tolera, pero el comprador se quedaría sin QR). Esta prueba fija que la
      // combinación elegida admite el tamaño real del token.
      const headers = await signedHeaders();
      const res = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );
      const data = await res.json();

      expect(String(data.jws).length).toBeGreaterThan(300);
      expect(data.qrDataUrl).not.toBeNull();
      expect(String(data.qrPayload).length).toBeGreaterThan(300);
    });

    it("rechaza una autorización caducada y una con vigencia excesiva (> 5 min)", async () => {
      const expired = await signedHeaders(TOKEN_ID, { expiresAt: Math.floor(Date.now() / 1000) - 10 });
      const tooLong = await signedHeaders(TOKEN_ID, {
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      for (const headers of [expired, tooLong]) {
        const res = await getQR(
          new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
          { params: Promise.resolve({ tokenId: TOKEN_ID }) },
        );
        expect(res.status).toBe(401);
      }
    });

    it("rechaza reutilizar la MISMA firma (nonce de un solo uso)", async () => {
      const headers = await signedHeaders(TOKEN_ID, { nonce: "nonce-repetido" });

      const first = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );
      const second = await getQR(
        new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}`, { headers }),
        { params: Promise.resolve({ tokenId: TOKEN_ID }) },
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(401);
      expect((await second.json()).message).toContain("ya se utilizó");
    });

    it("debe devolver 404 si el token no existe", async () => {
      const req = new NextRequest("http://localhost:3000/api/qr/99999999");
      const res = await getQR(req, {
        params: Promise.resolve({ tokenId: "99999999" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("NOT_FOUND");
    });
  });

  describe("POST /api/qr/:tokenId/send-email", () => {
    it("debe rechazar emails inválidos con 400", async () => {
      const req = new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}/send-email`, {
        method: "POST",
        body: JSON.stringify({ email: "correo-invalido" }),
      });
      const res = await sendQREmail(req, {
        params: Promise.resolve({ tokenId: TOKEN_ID }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("SIN firma del titular responde 401 (no se envía el resguardo a nadie)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}/send-email`, {
        method: "POST",
        body: JSON.stringify({ email: "huesped@ejemplo.com" }),
      });
      const res = await sendQREmail(req, {
        params: Promise.resolve({ tokenId: TOKEN_ID }),
      });

      expect(res.status).toBe(401);
      expect(mockEnqueueEphemeralEmail).not.toHaveBeenCalled();
    });

    it("debe encolar email efímero sin persistir en BD (RGPD art. 5.1.c)", async () => {
      const headers = await signedHeaders();
      const req = new NextRequest(`http://localhost:3000/api/qr/${TOKEN_ID}/send-email`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: "huesped@ejemplo.com" }),
      });
      const res = await sendQREmail(req, {
        params: Promise.resolve({ tokenId: TOKEN_ID }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("QUEUED");

      // Verificación de aislamiento RGPD: se llamó a enqueueEphemeralEmail y NO a enqueueNotification
      expect(mockEnqueueEphemeralEmail).toHaveBeenCalledTimes(1);
      expect(mockEnqueueEphemeralEmail).toHaveBeenCalledWith(
        "huesped@ejemplo.com",
        expect.objectContaining({
          tokenId: TOKEN_ID,
          roomNumber: 101,
          qrPayload: expect.stringContaining("/checkin#ticket="),
        }),
      );
      expect(mockEnqueueNotification).not.toHaveBeenCalled();
    });
  });
});
