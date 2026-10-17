import { describe, expect, it } from "vitest";
import {
  ROOM_PUBLICATION_SIGNATURE_TTL_SECONDS,
  TICKET_AUTHORIZATION_TYPES,
  REVIEW_AUTHORIZATION_TYPES,
  WALLET_MESSAGE_SPECS,
  formatCC,
  formatNightISO,
  formatNightLong,
  formatUtcTimestamp,
  isFreshPublicationSignature,
  nightLabelForToken,
  reviewAuthorizationMessage,
  roomPublicationMessage,
  roomTypeLabel,
  ticketAuthorizationMessage,
  walletMessageSpec,
  type WalletInteractionId,
} from "./wallet-messages";

/**
 * Guardián del diseño de mensajes de la wallet (ADR-30): lo que el usuario firma tiene que
 * entenderse sin conocimientos técnicos. Estas pruebas fijan:
 *   1. **Cobertura**: toda interacción con firma/autorización está catalogada.
 *   2. **Lenguaje llano**: cada ficha tiene motivo, resumen, «qué NO autoriza» y riesgo.
 *   3. **Campos legibles**: el mensaje firmado (EIP-712) no usa identificadores opacos.
 *   4. **Determinismo**: el texto que firma el cliente es el mismo que reconstruye el servidor.
 */

/** Interacciones que la wallet firma o autoriza hoy en el producto. */
const LIVE_INTERACTIONS: readonly WalletInteractionId[] = [
  "publishRoomContent",
  "downloadTicket",
  "submitReview",
  "operationalAction",
  "buyPrimary",
  "buyResale",
  "listForResale",
  "cancelListing",
  "claimFunds",
  "checkIn",
  "bidAuction",
  "manageAuction",
];

describe("catálogo de mensajes de la wallet", () => {
  it("toda interacción que firma la wallet está catalogada exactamente una vez", () => {
    for (const id of LIVE_INTERACTIONS) {
      const matches = WALLET_MESSAGE_SPECS.filter((spec) => spec.id === id);
      expect(matches, `falta o está duplicada la interacción ${id}`).toHaveLength(1);
    }
    const ids = WALLET_MESSAGE_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada ficha explica en lenguaje llano qué se firma, qué NO y qué riesgo tiene", () => {
    for (const spec of WALLET_MESSAGE_SPECS) {
      expect(spec.title.length, `${spec.id}: título vacío`).toBeGreaterThan(10);
      expect(spec.summary.length, `${spec.id}: resumen vacío`).toBeGreaterThan(20);
      expect(spec.notAuthorized.length, `${spec.id}: falta «qué NO autoriza»`).toBeGreaterThan(20);
      expect(spec.verifiedBy.length, `${spec.id}: falta quién verifica`).toBeGreaterThan(10);
      expect(spec.risk.length, `${spec.id}: falta el riesgo`).toBeGreaterThan(10);
      // Nada de jerga cruda en el texto que se explica al usuario.
      expect(spec.title).not.toMatch(/0x|wei|tokenId|expiresAt|hash/i);
    }
  });

  it("las transacciones no declaran campos (la wallet pinta función y argumentos)", () => {
    for (const spec of WALLET_MESSAGE_SPECS.filter((s) => s.method === "transaction")) {
      expect(spec.fields, `${spec.id} no debería declarar campos`).toHaveLength(0);
    }
  });

  it("los mensajes EIP-712 usan campos legibles, no identificadores opacos", () => {
    for (const spec of WALLET_MESSAGE_SPECS.filter((s) => s.method === "eth_signTypedData_v4")) {
      if (spec.id === "operationalAction") continue; // limitación documentada: lo verifica el contrato
      const names = spec.fields.map((f) => f.name);
      expect(names).toContain("motivo");
      expect(names).toContain("noche");
      expect(names).toContain("habitacion");
      expect(names).not.toContain("tokenId");
      expect(names).not.toContain("expiresAt");
    }
  });

  it("walletMessageSpec() devuelve la ficha o undefined", () => {
    expect(walletMessageSpec("downloadTicket")?.title).toContain("resguardo");
    expect(walletMessageSpec("no-existe" as WalletInteractionId)).toBeUndefined();
  });
});

describe("formateadores legibles", () => {
  it("la noche se muestra en ISO y en español, sin zona horaria", () => {
    expect(formatNightISO(20261115)).toBe("2026-11-15");
    expect(formatNightLong(20261115)).toBe("15 de noviembre de 2026");
    expect(formatNightLong(20260105)).toBe("5 de enero de 2026");
    expect(formatNightISO(20260105)).toBe("2026-01-05");
  });

  it("la marca de tiempo UTC es determinista (misma entrada, mismo texto)", () => {
    expect(formatUtcTimestamp(1792246737)).toBe("2026-10-17 14:18 UTC");
    expect(formatUtcTimestamp(1792246737)).toBe(formatUtcTimestamp(1792246737));
    expect(formatUtcTimestamp(0)).toBe("");
  });

  it("los importes se muestran con coma decimal y sufijo CC", () => {
    expect(formatCC(200_000_000_000_000_000n)).toBe("0,20 CC");
    expect(formatCC(1_000_000_000_000_000_000n)).toBe("1,00 CC");
    expect(formatCC(1_000_000_000_000_000n)).toBe("0,00 CC");
    expect(formatCC(0n)).toBe("0,00 CC");
  });

  it("el tipo de habitación se dice en llano", () => {
    expect(roomTypeLabel("simple")).toBe("individual");
    expect(roomTypeLabel("doble")).toBe("doble");
    expect(roomTypeLabel("suite")).toBe("suite");
    expect(roomTypeLabel("desconocido")).toBe("desconocido");
  });

  it("la etiqueta de la noche da habitación y fecha", () => {
    const label = nightLabelForToken(20120261115n);
    expect(label).toContain("habitación 201");
    expect(label).toContain("suite");
    expect(label).toContain("15 de noviembre de 2026");
  });
});

describe("mensaje firmado de publicación de contenido (personal_sign)", () => {
  const input = {
    roomNumber: 201,
    roomType: "suite",
    contentHash: "0x3f2a5c9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c",
    issuedAtSeconds: 1792246737,
    domain: "hotel-mcp-web-d6jlzeq5yq-ew.a.run.app",
  };

  it("dice en lenguaje llano qué se autoriza y qué NO", () => {
    const text = roomPublicationMessage(input);
    expect(text).toContain("ficha de la habitación 201 (suite)");
    expect(text).toContain("Esta firma solo acredita que apruebas ese contenido.");
    expect(text).toContain("No autoriza pagos, ni precios, ni otras acciones del contrato.");
  });

  it("incluye la huella, la hora UTC y el dominio (anti-phishing)", () => {
    const text = roomPublicationMessage(input);
    expect(text).toContain(input.contentHash);
    expect(text).toContain("2026-10-17 14:18 UTC");
    expect(text).toContain(input.domain);
  });

  it("es determinista: el servidor puede reconstruirlo byte a byte", () => {
    expect(roomPublicationMessage(input)).toBe(roomPublicationMessage({ ...input }));
  });

  it("no filtra datos innecesarios (sin tokenId, sin importes)", () => {
    const text = roomPublicationMessage(input);
    expect(text).not.toContain("tokenId");
    expect(text).not.toContain(" CC"); // sin importes: esta firma no mueve dinero
  });

  it("la firma caduca a los 5 minutos", () => {
    const now = 1792246737;
    expect(ROOM_PUBLICATION_SIGNATURE_TTL_SECONDS).toBe(300);
    expect(isFreshPublicationSignature(now, now)).toBe(true);
    expect(isFreshPublicationSignature(now, now + 300)).toBe(true);
    expect(isFreshPublicationSignature(now, now + 301)).toBe(false);
    expect(isFreshPublicationSignature(now, now - 301)).toBe(false);
  });
});

describe("typed data legible del resguardo y de la reseña", () => {
  it("el resguardo firma motivo, habitación, noche, nonce y vigencia", () => {
    const message = ticketAuthorizationMessage({
      tokenId: 20120261115n,
      nonce: "abc123",
      expiresAtSeconds: 1792250400,
    });
    expect(message).toEqual({
      motivo: "Descargar el resguardo de mi noche",
      habitacion: 201n,
      noche: "2026-11-15",
      nonce: "abc123",
      validoHasta: 1792250400n,
    });
    const names = TICKET_AUTHORIZATION_TYPES.TicketAuthorization.map((f) => f.name);
    expect(names).toEqual(["motivo", "habitacion", "noche", "nonce", "validoHasta"]);
  });

  it("la reseña firma además la nota como estrellas (no manipulable)", () => {
    const message = reviewAuthorizationMessage({
      tokenId: 20120261115n,
      rating: 4,
      nonce: "abc123",
      expiresAtSeconds: 1792250400,
    });
    expect(message.motivo).toBe("Publicar mi reseña de la noche");
    expect(message.estrellas).toBe(4);
    expect(message.habitacion).toBe(201n);
    expect(message.noche).toBe("2026-11-15");
    const names = REVIEW_AUTHORIZATION_TYPES.ReviewAuthorization.map((f) => f.name);
    expect(names).toContain("estrellas");
    expect(names).toContain("motivo");
  });
});
