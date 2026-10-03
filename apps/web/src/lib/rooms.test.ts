import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  isEthAddress,
  isHexSignature,
  parseAmenityCodes,
  parseRoomFields,
  parseRoomSpaces,
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

  /**
   * Ficha ampliada (2026-10-02): físicas de la vista, accesibilidad, decoración, servicios y espacios.
   * Estas reglas son las que comparten el alta (`POST`) y la edición (`PATCH`).
   */
  describe("parseRoomFields · ficha ampliada", () => {
    const base = { roomNumber: 101, roomType: "DOBLE", capacity: 2, beds: 2 } as const;

    it("acepta vistas y estilos del catálogo cerrado", () => {
      const result = parseRoomFields(
        { ...base, viewKind: "SEA", decorStyle: "MEDITERRANEAN", hasBalcony: true, isAccessible: true },
        { partial: false },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fields.viewKind).toBe("SEA");
        expect(result.fields.decorStyle).toBe("MEDITERRANEAN");
        expect(result.fields.hasBalcony).toBe(true);
        expect(result.fields.isAccessible).toBe(true);
      }
    });

    it("rechaza una vista o un estilo fuera del catálogo", () => {
      const view = parseRoomFields({ ...base, viewKind: "MOUNTAIN" }, { partial: false });
      expect(view.ok).toBe(false);
      if (!view.ok) expect(view.error).toBe("INVALID_VIEW");

      const style = parseRoomFields({ ...base, decorStyle: "BARROCO" }, { partial: false });
      expect(style.ok).toBe(false);
      if (!style.ok) expect(style.error).toBe("INVALID_DECOR_STYLE");
    });

    it("normaliza la vista y el estilo vacíos a null (sin dato)", () => {
      const result = parseRoomFields({ ...base, viewKind: "", decorStyle: null }, { partial: false });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fields.viewKind).toBeNull();
        expect(result.fields.decorStyle).toBeNull();
      }
    });

    it("recorta los descriptores decorativos y rechaza los que son demasiado largos", () => {
      const ok = parseRoomFields({ ...base, decorPalette: "  arena y azul  ", decorMaterials: "lino" }, { partial: false });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.fields.decorPalette).toBe("arena y azul");

      const tooLong = parseRoomFields({ ...base, decorPalette: "x".repeat(201) }, { partial: false });
      expect(tooLong.ok).toBe(false);
      if (!tooLong.ok) expect(tooLong.error).toBe("INVALID_DECOR");
    });

    it("exige que balcón y accesibilidad sean booleanos", () => {
      const result = parseRoomFields({ ...base, hasBalcony: "sí" }, { partial: false });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("INVALID_BOOLEAN");
    });

    it("acepta las notas de decoración en los tres idiomas", () => {
      const result = parseRoomFields(
        { ...base, decorNotesEs: "Notas", decorNotesEn: "Notes", decorNotesRu: "Заметки" },
        { partial: false },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fields.decorNotesEs).toBe("Notas");
        expect(result.fields.decorNotesRu).toBe("Заметки");
      }
    });
  });

  describe("parseAmenityCodes y parseRoomSpaces", () => {
    it("acepta una lista de servicios y elimina duplicados", () => {
      const result = parseAmenityCodes(["WIFI", "AC", "WIFI"]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(["WIFI", "AC"]);
    });

    it("rechaza una lista de servicios con elementos que no son códigos", () => {
      const result = parseAmenityCodes(["WIFI", 7]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("INVALID_AMENITIES");
    });

    it("acepta espacios con y sin superficie y elimina códigos repetidos", () => {
      const result = parseRoomSpaces([
        { spaceCode: "DORMITORIO", sizeM2: 18 },
        { spaceCode: "BANO", sizeM2: null },
        { spaceCode: "DORMITORIO", sizeM2: 20 },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([
          { spaceCode: "DORMITORIO", sizeM2: 18 },
          { spaceCode: "BANO", sizeM2: null },
        ]);
      }
    });

    it("rechaza una superficie no positiva", () => {
      const result = parseRoomSpaces([{ spaceCode: "BANO", sizeM2: -3 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("INVALID_SPACES");
    });

    it("rechaza formas que no son listas", () => {
      expect(parseAmenityCodes({ WIFI: true }).ok).toBe(false);
      expect(parseRoomSpaces("DORMITORIO").ok).toBe(false);
    });
  });
});
