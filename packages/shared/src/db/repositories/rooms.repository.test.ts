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
});
