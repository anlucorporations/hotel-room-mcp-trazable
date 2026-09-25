import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  createTicketJWS,
  verifyTicketJWS,
  decryptSecret,
  encryptSecret,
  verifyEIP712TicketRequest,
  QR_REDOWNLOAD_DOMAIN,
  QR_REDOWNLOAD_TYPES,
  type TicketPayload,
} from "./jws";

describe("Ticket JWS & AES Cryptography", () => {
  const samplePayload: TicketPayload = {
    tokenId: "10120260720",
    roomNumber: 101,
    checkInDate: "2026-07-20",
    roomType: "SIMPLE",
    guestWallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  it("genera y verifica un token JWS compacto de check-in", async () => {
    const jws = await createTicketJWS(samplePayload);
    expect(typeof jws).toBe("string");
    expect(jws.split(".").length).toBe(3);

    const verified = await verifyTicketJWS(jws);
    expect(verified.tokenId).toBe(samplePayload.tokenId);
    expect(verified.roomNumber).toBe(samplePayload.roomNumber);
    expect(verified.checkInDate).toBe(samplePayload.checkInDate);
    expect(verified.guestWallet).toBe(samplePayload.guestWallet);
  });

  it("falla al verificar un JWS manipulado o alterado", async () => {
    const jws = await createTicketJWS(samplePayload);
    const tampered = jws.substring(0, jws.length - 5) + "abcde";
    await expect(verifyTicketJWS(tampered)).rejects.toThrow();
  });

  it("descifra secretos AES-256-GCM correctamente", () => {
    const rawSecret = "HOTEL_SECRET_TOKEN_XYZ_12345";
    // Ciframos con la MISMA clave de entorno (`CHECKIN_SECRET_KEY`) que usa `decryptSecret`,
    // sin duplicar la derivación en la prueba: antes la prueba replicaba el literal de clave
    // retirado, así que habría seguido pasando con una clave distinta a la de producción.
    const storedEncrypted = encryptSecret(rawSecret);
    const parts = storedEncrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(24); // 12 bytes de IV
    expect(parts[1]).toHaveLength(32); // 16 bytes de etiqueta GCM

    expect(decryptSecret(storedEncrypted)).toBe(rawSecret);
  });

  it("rechaza un criptograma manipulado (la etiqueta GCM no valida)", () => {
    const storedEncrypted = encryptSecret("HOTEL_SECRET_TOKEN_XYZ_12345");
    const [iv, tag, data] = storedEncrypted.split(":");
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}00`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lanza error con formato de secreto cifrado inválido", () => {
    expect(() => decryptSecret("invalid_secret_format")).toThrow(
      "Formato de secreto cifrado inválido",
    );
  });
});

describe("EIP-712 Ticket Redownload Verification", () => {
  // Clave privada de prueba conocida (Anvil cuenta #0)
  const testPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
  const account = privateKeyToAccount(testPrivateKey);

  it("valida una firma EIP-712 legítima", async () => {
    const tokenId = 10120260720n;
    const nonce = "test-nonce-1234";
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 120);

    const signature = await account.signTypedData({
      domain: QR_REDOWNLOAD_DOMAIN,
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: {
        tokenId,
        nonce,
        expiresAt,
      },
    });

    const isValid = await verifyEIP712TicketRequest(
      account.address,
      signature,
      tokenId,
      nonce,
      expiresAt,
      QR_REDOWNLOAD_DOMAIN,
    );

    expect(isValid).toBe(true);
  });

  it("rechaza una vigencia declarada mayor que el máximo permitido (D-05)", async () => {
    const tokenId = 10120260720n;
    const nonce = "test-nonce-long-ttl";
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 h > 5 min

    const signature = await account.signTypedData({
      domain: QR_REDOWNLOAD_DOMAIN,
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: { tokenId, nonce, expiresAt },
    });

    const isValid = await verifyEIP712TicketRequest(
      account.address,
      signature,
      tokenId,
      nonce,
      expiresAt,
      QR_REDOWNLOAD_DOMAIN,
    );

    expect(isValid).toBe(false);
  });

  it("rechaza si la firma ha expirado", async () => {
    const tokenId = 10120260720n;
    const nonce = "test-nonce-expired";
    const pastExpiresAt = BigInt(Math.floor(Date.now() / 1000) - 100);

    const signature = await account.signTypedData({
      domain: QR_REDOWNLOAD_DOMAIN,
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: {
        tokenId,
        nonce,
        expiresAt: pastExpiresAt,
      },
    });

    const isValid = await verifyEIP712TicketRequest(
      account.address,
      signature,
      tokenId,
      nonce,
      pastExpiresAt,
      QR_REDOWNLOAD_DOMAIN,
    );

    expect(isValid).toBe(false);
  });

  it("rechaza si la firma proviene de una cuenta distinta", async () => {
    const otherAccount = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const tokenId = 10120260720n;
    const nonce = "test-nonce-diff";
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 120);

    const signature = await account.signTypedData({
      domain: QR_REDOWNLOAD_DOMAIN,
      types: QR_REDOWNLOAD_TYPES,
      primaryType: "DownloadTicket",
      message: {
        tokenId,
        nonce,
        expiresAt,
      },
    });

    const isValid = await verifyEIP712TicketRequest(
      otherAccount.address, // Wallet diferente a la firmante
      signature,
      tokenId,
      nonce,
      expiresAt,
      QR_REDOWNLOAD_DOMAIN,
    );

    expect(isValid).toBe(false);
  });
});
