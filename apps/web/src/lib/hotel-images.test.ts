import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  buildHotelImageFileName,
  contentImageUrl,
  isHotelImageName,
  isValidContentImageName,
  resolveContentImagePath,
} from "./hotel-images";
import { roomImagesDir } from "./room-images";

/** F6 · D-66/D-73: nombres de imagen de contenido válidos y sin traversal. */
describe("imágenes de contenido de la home (F6)", () => {
  it("acepta un nombre JPG simple", () => {
    expect(isValidContentImageName("playa-2026-09-27-1.jpg")).toBe(true);
    expect(isValidContentImageName("portada.jpg")).toBe(true);
  });

  it("rechaza traversal, subdirectorios y otros formatos", () => {
    expect(isValidContentImageName("../secreto.jpg")).toBe(false);
    expect(isValidContentImageName("a/b.jpg")).toBe(false);
    expect(isValidContentImageName("foto.png")).toBe(false);
    expect(isValidContentImageName("foto")).toBe(false);
  });

  it("resuelve la ruta dentro de la carpeta de imágenes", () => {
    const resolved = resolveContentImagePath("portada.jpg");
    expect(resolved).toBe(path.join(roomImagesDir(), "portada.jpg"));
  });

  it("no resuelve rutas inválidas", () => {
    expect(resolveContentImagePath("../secreto.jpg")).toBeNull();
    expect(resolveContentImagePath("foto.png")).toBeNull();
  });

  it("construye la URL pública del servidor de contenido", () => {
    expect(contentImageUrl("portada.jpg")).toBe("/api/content/images/portada.jpg");
  });

  it("genera el nombre canónico hotel-<seccion>-<fecha>-<n>.jpg (D-66)", () => {
    expect(buildHotelImageFileName("EXPERIENCE", new Date("2026-09-27T00:00:00Z"), 2)).toBe(
      "hotel-experience-2026-09-27-2.jpg",
    );
    expect(isHotelImageName("hotel-experience-2026-09-27-2.jpg")).toBe(true);
    expect(isHotelImageName("hotel-desconocida-2026-09-27-1.jpg")).toBe(false);
  });

  it("rechaza secciones e índices fuera de rango", () => {
    expect(() => buildHotelImageFileName("SPA", new Date(), 1)).toThrow();
    expect(() => buildHotelImageFileName("HERO", new Date(), 0)).toThrow();
  });
});
