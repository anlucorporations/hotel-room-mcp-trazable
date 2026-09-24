import { describe, expect, it } from "vitest";
import { QR_REDOWNLOAD_DOMAIN, QR_REDOWNLOAD_TYPES } from "@hotel/shared";
import { ticketSignatureMessage, TICKET_SIGNATURE_TTL_SECONDS } from "./ticketSignature";

/**
 * Mensaje EIP-712 con el que el titular autoriza la emisión de su resguardo (RF-07 · CU-08).
 *
 * Estas pruebas fijan la parte que **no** se puede equivocar: el `tokenId` tiene que viajar como
 * `bigint` (viem rechaza un `number` grande y el mensaje dejaría de verificar), la vigencia tiene
 * que caber en el tope de 5 minutos que impone la API (`requireTicketOwnership`) y el `nonce` no se
 * puede tocar. Un fallo aquí no rompe los tipos: la firma se calcula y la API responde 401 sin que
 * nadie sepa por qué.
 */
describe("mensaje EIP-712 del resguardo (RF-07)", () => {
  const NOW = 1_800_000_000; // instante fijo: la prueba no depende del reloj real

  it("declara el dominio y los tipos del mensaje del contrato", () => {
    expect(QR_REDOWNLOAD_DOMAIN.name).toBe("Hotel Marina del Sol");
    expect(QR_REDOWNLOAD_TYPES.DownloadTicket.map((f) => f.name)).toEqual([
      "tokenId",
      "nonce",
      "expiresAt",
    ]);
  });

  it("viaja con el tokenId como bigint y el nonce intacto", () => {
    const message = ticketSignatureMessage({
      tokenId: "10120260720",
      nonce: "nonce-abc",
      nowSeconds: NOW,
    });

    expect(typeof message.tokenId).toBe("bigint");
    expect(message.tokenId).toBe(10120260720n);
    expect(message.nonce).toBe("nonce-abc");
  });

  it("acota la vigencia al tope que acepta la API (5 minutos)", () => {
    const message = ticketSignatureMessage({
      tokenId: "1",
      nonce: "n",
      nowSeconds: NOW,
    });

    expect(typeof message.expiresAt).toBe("bigint");
    expect(message.expiresAt).toBe(BigInt(NOW + TICKET_SIGNATURE_TTL_SECONDS));
    // El servidor rechaza una autorización con vigencia mayor de 5 minutos: si esta constante se
    // sube sin tocar `MAX_SIGNATURE_TTL_SECONDS`, toda emisión de resguardo empezaría a dar 401.
    expect(TICKET_SIGNATURE_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(TICKET_SIGNATURE_TTL_SECONDS).toBeGreaterThan(0);
  });

  it("rechaza un tokenId que no es un entero válido", () => {
    expect(() => ticketSignatureMessage({ tokenId: "no-es-un-token", nonce: "n", nowSeconds: NOW })).toThrow();
    expect(() => ticketSignatureMessage({ tokenId: "1.5", nonce: "n", nowSeconds: NOW })).toThrow();
  });
});
