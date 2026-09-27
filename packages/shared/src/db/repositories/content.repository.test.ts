import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool } from "pg";
import { ContentRepository } from "./content.repository";

/** Pruebas del repositorio de contenido público (F6 · D-66, D-69, D-70). */

const imageRow = (o: Record<string, unknown> = {}) => ({
  id: "img-1",
  section: "EXPERIENCE",
  file_name: "playa-2026-09-27-1.jpg",
  storage_path: "docs/imagenes/playa-2026-09-27-1.jpg",
  position: 1,
  is_cover: true,
  alt_text_es: "Vistas al mar",
  alt_text_en: null,
  alt_text_ru: null,
  mime_type: "image/jpeg",
  byte_size: 1024,
  uploaded_by: "admin@hotel.es",
  uploaded_at: new Date("2026-09-27T00:00:00Z"),
  ...o,
});

const offerRow = (o: Record<string, unknown> = {}) => ({
  id: "off-1",
  code: "VERANO",
  title_es: "Escapada de verano",
  title_en: null,
  title_ru: null,
  body_es: "Dos noches con desayuno",
  body_en: null,
  body_ru: null,
  image_id: "img-1",
  image_file_name: "playa-2026-09-27-1.jpg",
  valid_from: "2026-06-01",
  valid_to: "2026-09-30",
  sort_order: 1,
  active: true,
  created_at: new Date("2026-05-01T00:00:00Z"),
  updated_at: new Date("2026-05-01T00:00:00Z"),
  ...o,
});

describe("ContentRepository (F6)", () => {
  let repository: ContentRepository;
  let pool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    pool = { query: vi.fn() } as unknown as Pool & { query: Mock };
    repository = new ContentRepository(pool);
  });

  it("lista las imágenes de una sección ordenadas por posición", async () => {
    pool.query.mockResolvedValueOnce({ rows: [imageRow(), imageRow({ id: "img-2", is_cover: false, position: 2 })], rowCount: 2 });
    const images = await repository.listImages("EXPERIENCE");
    expect(images).toHaveLength(2);
    expect(images[0]?.section).toBe("EXPERIENCE");
    expect(pool.query.mock.calls[0]?.[1]).toEqual(["EXPERIENCE"]);
  });

  it("devuelve la portada de una sección (o la primera) y null si está vacía", async () => {
    pool.query.mockResolvedValueOnce({ rows: [imageRow()], rowCount: 1 });
    expect((await repository.findCoverImage("HERO"))?.fileName).toBe("playa-2026-09-27-1.jpg");

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await repository.findCoverImage("HERO")).toBeNull();
  });

  it("lista los planes activos vigentes en la fecha indicada", async () => {
    pool.query.mockResolvedValueOnce({ rows: [offerRow()], rowCount: 1 });
    const offers = await repository.listOffers({ onDate: "2026-07-15" });
    expect(offers[0]?.titleEs).toBe("Escapada de verano");
    expect(offers[0]?.imageFileName).toBe("playa-2026-09-27-1.jpg");
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(String(sql)).toContain("o.active = TRUE");
    expect(values).toEqual(["2026-07-15", "2026-07-15"]);
  });

  it("sin fecha no aplica la ventana de validez", async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await repository.listOffers();
    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(String(sql)).toContain("o.active = TRUE");
    expect(String(sql)).not.toContain("valid_from");
  });

  it("registra una imagen y, si es portada, retira la anterior (D-73)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // limpiar portada
      .mockResolvedValueOnce({ rows: [imageRow({ is_cover: true })], rowCount: 1 });
    const image = await repository.addImage({
      section: "EXPERIENCE",
      fileName: "hotel-experience-2026-09-27-1.jpg",
      storagePath: "docs/imagenes/hotel-experience-2026-09-27-1.jpg",
      position: 1,
      isCover: true,
      byteSize: 1024,
      uploadedBy: "admin@hotel.es",
    });
    expect(image.isCover).toBe(true);
    const sqls = pool.query.mock.calls.map(([s]) => String(s));
    expect(sqls[0]).toContain("SET is_cover = FALSE");
    expect(sqls[1]).toContain("INSERT INTO hotel_images");
  });

  it("traduce la posición ocupada a POSITION_TAKEN", async () => {
    pool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(
      repository.addImage({
        section: "HERO",
        fileName: "hotel-hero-2026-09-27-1.jpg",
        storagePath: "docs/imagenes/hotel-hero-2026-09-27-1.jpg",
        position: 1,
        byteSize: 100,
        uploadedBy: "admin@hotel.es",
      }),
    ).rejects.toMatchObject({ code: "POSITION_TAKEN" });
  });

  it("borra imágenes y cambia la portada", async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await repository.deleteImage("img-1")).toBe(true);

    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [imageRow({ is_cover: true })], rowCount: 1 });
    const cover = await repository.setCoverImage("EXPERIENCE", "img-1");
    expect(cover?.isCover).toBe(true);
  });

  it("crea un plan y traduce el código duplicado (D-74)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [offerRow()], rowCount: 1 });
    const offer = await repository.createOffer({
      code: "VERANO",
      titleEs: "Escapada",
      createdBy: "admin@hotel.es",
    });
    expect(offer.code).toBe("VERANO");

    pool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(
      repository.createOffer({ code: "VERANO", titleEs: "Otra", createdBy: "admin@hotel.es" }),
    ).rejects.toMatchObject({ code: "OFFER_CODE_TAKEN" });
  });

  it("edita, activa y borra un plan", async () => {
    pool.query.mockResolvedValueOnce({ rows: [offerRow({ title_es: "Nuevo" })], rowCount: 1 });
    const updated = await repository.updateOffer("off-1", { titleEs: "Nuevo", sortOrder: 2 });
    expect(updated?.titleEs).toBe("Nuevo");

    pool.query.mockResolvedValueOnce({ rows: [offerRow({ active: false })], rowCount: 1 });
    expect((await repository.setOfferActive("off-1", false))?.active).toBe(false);

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await repository.deleteOffer("off-1")).toBe(true);
  });
});
