import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import {
  buildRoomImageFileName,
  formatUploadDate,
  isJpegWithinLimit,
  isValidRoomImageName,
  resolveRoomImagePath,
  roomTypeLabel,
  ROOM_IMAGE_MAX_BYTES,
} from "./room-images";

const date = new Date("2026-09-26T15:30:00Z");

describe("room-images (F1 · D-5, D-12, D-20)", () => {
  afterEach(() => {
    delete process.env.ROOM_IMAGES_DIR;
  });

  it("construye el nombre canónico <nº>-<tipo>-<fecha>-<n>.jpg (D-5/D-12)", () => {
    expect(buildRoomImageFileName(101, "DOBLE", date, 1)).toBe("101-Doble-2026-09-26-1.jpg");
    expect(buildRoomImageFileName(205, "SUITE", date, 3)).toBe("205-Suite-2026-09-26-3.jpg");
    expect(buildRoomImageFileName(7, "simple", date, 2)).toBe("7-Simple-2026-09-26-2.jpg");
  });

  it("rechaza índices fuera de 1..5 (D-20)", () => {
    expect(() => buildRoomImageFileName(101, "DOBLE", date, 0)).toThrow();
    expect(() => buildRoomImageFileName(101, "DOBLE", date, 6)).toThrow();
  });

  it("formatea la fecha en UTC", () => {
    expect(formatUploadDate(date)).toBe("2026-09-26");
  });

  it("etiqueta el tipo con la inicial en mayúscula", () => {
    expect(roomTypeLabel("SIMPLE")).toBe("Simple");
    expect(roomTypeLabel("suite")).toBe("Suite");
    expect(roomTypeLabel("TRIPLE")).toBeNull();
  });

  it("valida el patrón de nombre", () => {
    expect(isValidRoomImageName("101-Doble-2026-09-26-1.jpg")).toBe(true);
    expect(isValidRoomImageName("101-Doble-2026-09-26-6.jpg")).toBe(false);
    expect(isValidRoomImageName("101-Doble-2026-09-26-1.png")).toBe(false);
    expect(isValidRoomImageName("../secreto.jpg")).toBe(false);
    expect(isValidRoomImageName("101-Doble-2026-09-26-1.jpg/../x.jpg")).toBe(false);
  });

  it("resuelve la ruta absoluta dentro de la carpeta configurada", () => {
    process.env.ROOM_IMAGES_DIR = "/tmp/room-images-test";
    expect(resolveRoomImagePath("101-Doble-2026-09-26-1.jpg")).toBe(
      path.join("/tmp/room-images-test", "101-Doble-2026-09-26-1.jpg"),
    );
  });

  it("devuelve null ante un intento de traversal", () => {
    process.env.ROOM_IMAGES_DIR = "/tmp/room-images-test";
    expect(resolveRoomImagePath("../../etc/passwd")).toBeNull();
    expect(resolveRoomImagePath("../101-Doble-2026-09-26-1.jpg")).toBeNull();
  });

  it("solo acepta JPEG dentro del límite de 2 MB (D-20)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isJpegWithinLimit(jpeg)).toBe(true);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(isJpegWithinLimit(png)).toBe(false);

    const empty = new Uint8Array([]);
    expect(isJpegWithinLimit(empty)).toBe(false);

    const tooBig = new Uint8Array(ROOM_IMAGE_MAX_BYTES + 1);
    tooBig[0] = 0xff;
    tooBig[1] = 0xd8;
    tooBig[2] = 0xff;
    expect(isJpegWithinLimit(tooBig)).toBe(false);
  });
});
