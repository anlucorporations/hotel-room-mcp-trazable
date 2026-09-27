import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  isEthAddress,
  isHexSignature,
  parseRoomFields,
  roomContentHash,
  verifyRoomPublicationSignature,
} from "./rooms";

const baseRoom = {
  roomNumber: 101,
  roomType: "DOBLE",
  capacity: 2,
  beds: 2,
  sizeM2: 24.5,
  descriptionEs: "Doble",
  descriptionEn: null,
  descriptionRu: null,
  baseRateWei: null,
  imageFileNames: ["101-Doble-2026-09-26-1.jpg"],
};

describe("rooms: validación y huella (F1)", () => {
  describe("parseRoomFields", () => {
    it("exige número, tipo, capacidad y camas en el alta (D-21)", () => {
      const result = parseRoomFields({ roomNumber: 101, roomType: "DOBLE" }, { partial: false });
      expect(result.ok).toBe(false);
    });

    it("rechaza un tipo no admitido (D-22)", () => {
      const result = parseRoomFields(
        { roomNumber: 1, roomType: "TRIPLE", capacity: 1, beds: 1 },
        { partial: false },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("INVALID_ROOM_TYPE");
    });

    it("acepta números fuera de rango (D-7)", () => {
      const result = parseRoomFields(
        { roomNumber: 999, roomType: "SUITE", capacity: 2, beds: 1 },
        { partial: false },
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.fields.roomNumber).toBe(999);
    });

    it("en edición parcial no exige campos", () => {
      const result = parseRoomFields({ capacity: 3 }, { partial: true });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.fields).toEqual({ capacity: 3 });
    });
  });

  describe("roomContentHash", () => {
    it("es determinista e independiente del orden de las imágenes (D-18)", () => {
      const a = roomContentHash({ ...baseRoom, imageFileNames: ["a.jpg", "b.jpg"] });
      const b = roomContentHash({ ...baseRoom, imageFileNames: ["b.jpg", "a.jpg"] });
      expect(a).toBe(b);
      expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("cambia cuando cambia la ficha", () => {
      const a = roomContentHash(baseRoom);
      const b = roomContentHash({ ...baseRoom, capacity: 3 });
      expect(a).not.toBe(b);
    });
  });

  describe("firma (D-1/D-2)", () => {
    it("valida formatos de firma y dirección", () => {
      expect(isHexSignature("0x" + "ab".repeat(65))).toBe(true);
      expect(isHexSignature("0x1234")).toBe(false);
      expect(isEthAddress("0x" + "a".repeat(40))).toBe(true);
      expect(isEthAddress("0x1234")).toBe(false);
    });

    it("verifica una firma EIP-191 correcta sobre la huella", async () => {
      const account = privateKeyToAccount(`0x${"33".repeat(32)}`);
      const contentHash = roomContentHash(baseRoom);
      const signature = await account.signMessage({ message: contentHash });

      expect(
        await verifyRoomPublicationSignature({
          contentHash,
          signature,
          signerAddress: account.address,
        }),
      ).toBe(true);
    });

    it("rechaza una firma de otra huella y una mal formada", async () => {
      const account = privateKeyToAccount(`0x${"44".repeat(32)}`);
      const signature = await account.signMessage({ message: "0xotra" });

      expect(
        await verifyRoomPublicationSignature({
          contentHash: roomContentHash(baseRoom),
          signature,
          signerAddress: account.address,
        }),
      ).toBe(false);
      expect(
        await verifyRoomPublicationSignature({
          contentHash: roomContentHash(baseRoom),
          signature: "0x1234",
          signerAddress: account.address,
        }),
      ).toBe(false);
    });
  });
});
