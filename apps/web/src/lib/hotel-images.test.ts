import { describe, expect, it } from "vitest";
import path from "node:path";
import { contentImageUrl, isValidContentImageName, resolveContentImagePath } from "./hotel-images";
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
});
