import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { Pool, QueryResultRow } from "pg";
import { RoomsRepository, RoomRepositoryError } from "./rooms.repository";

/** Fila de `rooms` con los nombres reales de columna. */
function roomRow(overrides: Partial<Record<string, unknown>> = {}): QueryResultRow {
  return {
    id: "room-1",
    room_number: 101,
    floor: 1,
    room_type: "DOBLE",
    capacity: 2,
    beds: 2,
    size_m2: "24.50",
    description_es: "Habitación doble con vistas",
    description_en: null,
    description_ru: null,
    base_rate_wei: "100000000000000000",
    publication_status: "DRAFT",
    operational_status: "CLEAN",
    archived_at: null,
    created_at: new Date("2026-09-26T10:00:00Z"),
    updated_at: new Date("2026-09-26T10:00:00Z"),
    ...overrides,
  };
}

describe("RoomsRepository (D-1…D-26)", () => {
  let repository: RoomsRepository;
  let mockPool: Pool & { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = { query: vi.fn() } as Pool & { query: Mock };
    repository = new RoomsRepository(mockPool);
  });

  describe("listRooms", () => {
    it("excluye las archivadas por defecto (D-8)", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] });
      const rooms = await repository.listRooms();
      expect(rooms).toHaveLength(1);
      expect(String(mockPool.query.mock.calls[0][0])).toContain("WHERE archived_at IS NULL");
    });

    it("las incluye cuando se pide expresamente", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow({ archived_at: new Date() })] });
      const rooms = await repository.listRooms({ includeArchived: true });
      expect(rooms).toHaveLength(1);
      expect(String(mockPool.query.mock.calls[0][0])).not.toContain("WHERE archived_at IS NULL");
    });
  });

  describe("findByNumber", () => {
    it("devuelve null si la habitación no existe", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.findByNumber(999)).toBeNull();
    });
  });

  describe("mapeo de fila", () => {
    it("convierte size_m2 NUMERIC a número y conserva base_rate_wei como cadena", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] });
      const room = await repository.findById("room-1");
      expect(room?.sizeM2).toBe(24.5);
      expect(room?.baseRateWei).toBe("100000000000000000");
      expect(room?.publicationStatus).toBe("DRAFT");
    });
  });

  describe("createRoom", () => {
    it("inserta y devuelve la habitación creada", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow({ room_number: 205 })] });
      const room = await repository.createRoom({
        roomNumber: 205,
        roomType: "SUITE",
        capacity: 2,
        beds: 1,
        descriptionEs: "Suite",
      });
      expect(room.roomNumber).toBe(205);
    });

    it("traduce la violación de unicidad a ROOM_NUMBER_TAKEN (D-7)", async () => {
      mockPool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
      await expect(
        repository.createRoom({ roomNumber: 101, roomType: "SIMPLE", capacity: 1, beds: 1 }),
      ).rejects.toBeInstanceOf(RoomRepositoryError);
    });
  });

  describe("updateRoom", () => {
    it("solo actualiza los campos presentes", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow({ capacity: 3 })] });
      await repository.updateRoom("room-1", { capacity: 3 });
      const sql = String(mockPool.query.mock.calls[0][0]);
      expect(sql).toContain("capacity = $1");
      expect(sql).not.toContain("room_number =");
      expect(sql).toContain("updated_at = NOW()");
    });

    it("sin campos que cambiar devuelve la fila actual sin UPDATE", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] }); // findById
      const room = await repository.updateRoom("room-1", {});
      expect(room?.id).toBe("room-1");
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("archiveRoom", () => {
    it("marca OUT_OF_SERVICE, fija archived_at y registra el historial (D-8/D-23)", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [roomRow()] }) // findById
        .mockResolvedValueOnce({ rows: [roomRow({ publication_status: "OUT_OF_SERVICE", archived_at: new Date() })] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // historial

      const room = await repository.archiveRoom("room-1", "admin@hotel.es");
      expect(room?.publicationStatus).toBe("OUT_OF_SERVICE");
      const historySql = String(mockPool.query.mock.calls[2][0]);
      expect(historySql).toContain("room_status_history");
    });
  });

  describe("setPublicationStatus", () => {
    it("registra historial al cambiar de estado (D-19)", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [roomRow()] })
        .mockResolvedValueOnce({ rows: [roomRow({ publication_status: "PUBLISHED" })] })
        .mockResolvedValueOnce({ rows: [] });
      const room = await repository.setPublicationStatus("room-1", "PUBLISHED", "admin@hotel.es");
      expect(room?.publicationStatus).toBe("PUBLISHED");
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it("no duplica historial si el estado no cambia", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [roomRow({ publication_status: "DRAFT" })] })
        .mockResolvedValueOnce({ rows: [roomRow({ publication_status: "DRAFT" })] });
      await repository.setPublicationStatus("room-1", "DRAFT", "admin@hotel.es");
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("galería (D-5/D-20)", () => {
    it("rechaza una posición fuera de 1..5", async () => {
      await expect(
        repository.addImage({
          roomId: "room-1",
          fileName: "101-doble-2026-09-26-6.jpg",
          storagePath: "/docs/imagenes/101-doble-2026-09-26-6.jpg",
          position: 6,
          byteSize: 1000,
          uploadedBy: "admin@hotel.es",
        }),
      ).rejects.toBeInstanceOf(RoomRepositoryError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it("retira la portada anterior antes de insertar la nueva", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE is_cover = FALSE
        .mockResolvedValueOnce({
          rows: [
            {
              id: "img-1",
              room_id: "room-1",
              file_name: "101-doble-2026-09-26-1.jpg",
              storage_path: "/docs/imagenes/101-doble-2026-09-26-1.jpg",
              position: 1,
              is_cover: true,
              alt_text_es: null,
              alt_text_en: null,
              alt_text_ru: null,
              mime_type: "image/jpeg",
              byte_size: 1000,
              uploaded_by: "admin@hotel.es",
              uploaded_at: new Date(),
            },
          ],
        });

      const image = await repository.addImage({
        roomId: "room-1",
        fileName: "101-doble-2026-09-26-1.jpg",
        storagePath: "/docs/imagenes/101-doble-2026-09-26-1.jpg",
        position: 1,
        isCover: true,
        byteSize: 1000,
        uploadedBy: "admin@hotel.es",
      });
      expect(image.isCover).toBe(true);
      expect(String(mockPool.query.mock.calls[0][0])).toContain("is_cover = FALSE");
    });

    it("traduce la violación de unicidad de posición a IMAGE_LIMIT", async () => {
      mockPool.query.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
      await expect(
        repository.addImage({
          roomId: "room-1",
          fileName: "101-doble-2026-09-26-1.jpg",
          storagePath: "/x.jpg",
          position: 1,
          byteSize: 1000,
          uploadedBy: "admin@hotel.es",
        }),
      ).rejects.toBeInstanceOf(RoomRepositoryError);
    });

    it("setCoverImage devuelve false si la imagen es de otra habitación", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "img-1",
            room_id: "room-OTRA",
            file_name: "x.jpg",
            storage_path: "/x.jpg",
            position: 1,
            is_cover: false,
            alt_text_es: null,
            alt_text_en: null,
            alt_text_ru: null,
            mime_type: "image/jpeg",
            byte_size: 1,
            uploaded_by: "a",
            uploaded_at: new Date(),
          },
        ],
      });
      expect(await repository.setCoverImage("room-1", "img-1")).toBe(false);
    });
  });

  describe("publicaciones ancladas (D-2/D-18)", () => {
    it("queda anclada cuando se aporta txHash", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "pub-1",
            room_id: "room-1",
            content_hash: "0xabc",
            tx_hash: "0xdead",
            on_chain_anchored: true,
            published_by: "admin@hotel.es",
            published_at: new Date(),
            unpublished_at: null,
          },
        ],
      });
      const pub = await repository.recordPublication({
        roomId: "room-1",
        contentHash: "0xabc",
        txHash: "0xdead",
        publishedBy: "admin@hotel.es",
      });
      expect(pub.onChainAnchored).toBe(true);
      expect(pub.txHash).toBe("0xdead");
    });

    it("queda pendiente (no anclada) cuando no hay txHash", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "pub-2",
            room_id: "room-1",
            content_hash: "0xabc",
            tx_hash: null,
            on_chain_anchored: false,
            published_by: "admin@hotel.es",
            published_at: new Date(),
            unpublished_at: null,
          },
        ],
      });
      const pub = await repository.recordPublication({
        roomId: "room-1",
        contentHash: "0xabc",
        publishedBy: "admin@hotel.es",
      });
      expect(pub.onChainAnchored).toBe(false);
      expect(pub.txHash).toBeNull();
    });
  });

  /**
   * Ficha ampliada (2026-10-02): físicas de la vista, accesibilidad, decoración, servicios y espacios.
   * El SQL de reemplazo se validó además contra un **PostgreSQL real** (ver `estado_proyecto.md`);
   * aquí se fija la forma de las sentencias y el mapeo, que es lo que un mock sí puede afirmar.
   */
  describe("ficha ampliada: campos, servicios y espacios", () => {
    /** Pool con cliente transaccional, que es lo que usan los reemplazos de conjuntos. */
    function withTransactionalClient(): { query: Mock; release: Mock } {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
      (mockPool as unknown as { connect: Mock }).connect = vi.fn().mockResolvedValue(client);
      return client;
    }

    it("el alta escribe las columnas nuevas y sus valores", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] });
      await repository.createRoom({
        roomNumber: 101,
        roomType: "DOBLE",
        capacity: 2,
        beds: 2,
        viewKind: "SEA",
        hasBalcony: true,
        isAccessible: true,
        decorStyle: "MEDITERRANEAN",
        decorPalette: "arena",
        decorMaterials: "lino",
        decorNotesEs: "Notas",
      });
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(String(sql)).toContain("view_kind");
      expect(String(sql)).toContain("decor_notes_ru");
      expect(values).toContain("SEA");
      expect(values).toContain("MEDITERRANEAN");
      expect(values).toContain("arena");
    });

    it("mapea la ficha ampliada y es tolerante con una fila antigua sin esas columnas", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [roomRow({ view_kind: "GARDEN", has_balcony: true, is_accessible: false, decor_style: "CLASSIC", decor_palette: "verde", decor_materials: "roble", decor_notes_es: "n", decor_notes_en: null, decor_notes_ru: null })],
      });
      const room = await repository.findById("room-1");
      expect(room?.viewKind).toBe("GARDEN");
      expect(room?.hasBalcony).toBe(true);
      expect(room?.decorStyle).toBe("CLASSIC");

      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] });
      const legacy = await repository.findById("room-1");
      expect(legacy?.viewKind).toBeNull();
      expect(legacy?.hasBalcony).toBe(false);
      expect(legacy?.decorPalette).toBeNull();
    });

    it("la edición parcial incluye las columnas decorativas", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [roomRow()] });
      await repository.updateRoom("room-1", { decorStyle: "RUSTIC", isAccessible: true });
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(String(sql)).toContain("decor_style");
      expect(String(sql)).toContain("is_accessible");
      expect(values).toContain("RUSTIC");
    });

    it("reemplaza los servicios en una transacción (borra y vuelve a insertar)", async () => {
      const client = withTransactionalClient();
      await repository.setRoomAmenities("room-1", ["WIFI", "AC"]);
      const statements = client.query.mock.calls.map((call) => String(call[0]));
      expect(statements).toContain("BEGIN");
      expect(statements.some((sql) => sql.includes("DELETE FROM room_amenity_links"))).toBe(true);
      expect(statements.some((sql) => sql.includes("INSERT INTO room_amenity_links"))).toBe(true);
      expect(statements).toContain("COMMIT");
      expect(client.release).toHaveBeenCalled();
    });

    it("un conjunto vacío deja la habitación sin servicios (solo borra)", async () => {
      const client = withTransactionalClient();
      await repository.setRoomAmenities("room-1", []);
      const statements = client.query.mock.calls.map((call) => String(call[0]));
      expect(statements.some((sql) => sql.includes("DELETE FROM room_amenity_links"))).toBe(true);
      expect(statements.some((sql) => sql.includes("INSERT INTO room_amenity_links"))).toBe(false);
    });

    it("si falla la inserción de espacios, revierte la transacción", async () => {
      const client = withTransactionalClient();
      client.query.mockImplementation(async (sql: string) => {
        if (String(sql).includes("INSERT INTO room_spaces")) throw new Error("boom");
        return { rows: [] };
      });
      await expect(repository.setRoomSpaces("room-1", [{ spaceCode: "BANO", sizeM2: 6 }])).rejects.toThrow("boom");
      const statements = client.query.mock.calls.map((call) => String(call[0]));
      expect(statements).toContain("ROLLBACK");
      expect(client.release).toHaveBeenCalled();
    });

    it("lista servicios y espacios con sus catálogos", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ amenity_code: "WIFI" }, { amenity_code: "AC" }] });
      expect(await repository.listAmenityCodes("room-1")).toEqual(["WIFI", "AC"]);

      mockPool.query.mockResolvedValueOnce({ rows: [{ space_code: "BANO", size_m2: "6.00", sort_order: 3 }] });
      expect(await repository.listRoomSpaces("room-1")).toEqual([{ spaceCode: "BANO", sizeM2: 6, sortOrder: 3 }]);

      mockPool.query.mockResolvedValueOnce({ rows: [{ code: "WIFI", name_es: "Wi-Fi", name_en: "Wi-Fi", name_ru: "Wi-Fi", sort_order: 1 }] });
      expect((await repository.listAmenityCatalog())[0]).toMatchObject({ code: "WIFI", nameEs: "Wi-Fi" });

      mockPool.query.mockResolvedValueOnce({ rows: [{ code: "DORMITORIO", name_es: "Dormitorio", name_en: "Bedroom", name_ru: "Спальня", sort_order: 1 }] });
      expect((await repository.listSpaceTypes())[0]?.nameRu).toBe("Спальня");

      mockPool.query.mockResolvedValueOnce({ rows: [{ code: "SUITE", name_es: "Suite", name_en: "Suite", name_ru: "Люкс", base_capacity: 2, royalty_bps: 1000, sort_order: 3 }] });
      expect((await repository.listRoomTypes())[0]).toMatchObject({ code: "SUITE", royaltyBps: 1000 });
    });

    it("el calendario une reservas y noches vendidas y devuelve fechas ISO", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ night: "2026-10-12" }, { night: "2026-10-13" }] });
      const nights = await repository.listReservedNights("room-1", "2026-10-01", "2026-10-31");
      expect(nights).toEqual(["2026-10-12", "2026-10-13"]);
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(String(sql)).toContain("reservation_nights");
      expect(String(sql)).toContain("nfts");
      expect(String(sql)).toContain("status <> 'AVAILABLE'");
      expect(values).toEqual(["room-1", "2026-10-01", "2026-10-31"]);
    });
  });

  describe("countReservedNightsByRooms (2026-10-04, tablero Admin)", () => {
    it("devuelve roomId → nº de noches y deja fuera a las sin reservas", async () => {
      // `COUNT()` llega como CADENA desde node-postgres (bigint): el repositorio debe convertirla a
      // número o las reglas del tablero (`=== 0`) fallarán (defecto detectado en la release v21).
      mockPool.query.mockResolvedValueOnce({ rows: [{ room_id: "room-1", nights: "3" }, { room_id: "room-2", nights: "1" }] });
      const counts = await repository.countReservedNightsByRooms(["room-1", "room-2", "room-3"], "2026-10-01", "2026-10-31");
      expect(counts.get("room-1")).toBe(3);
      expect(typeof counts.get("room-1")).toBe("number");
      expect(counts.get("room-2")).toBe(1);
      expect(counts.has("room-3")).toBe(false);
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(String(sql)).toContain("COUNT(DISTINCT night)");
      expect(String(sql)).toContain("ANY($1::uuid[])");
      expect(values).toEqual([["room-1", "room-2", "room-3"], "2026-10-01", "2026-10-31"]);
    });

    it("no dispara query si la lista está vacía", async () => {
      const counts = await repository.countReservedNightsByRooms([], "2026-10-01", "2026-10-31");
      expect(counts.size).toBe(0);
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe("listReleaseableReservationIds (2026-10-04, acción «Liberar»)", () => {
    it("solo devuelve reservas PENDING/CONFIRMED con noches en la ventana", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ reservation_id: "res-1" }, { reservation_id: "res-2" }] });
      const ids = await repository.listReleaseableReservationIds("room-1", "2026-10-01", "2026-10-31");
      expect(ids).toEqual(["res-1", "res-2"]);
      const [sql, values] = mockPool.query.mock.calls[0];
      expect(String(sql)).toContain("status IN ('PENDING', 'CONFIRMED')");
      expect(String(sql)).not.toContain("COMPLETED");
      expect(values).toEqual(["room-1", "2026-10-01", "2026-10-31"]);
    });
  });
});
