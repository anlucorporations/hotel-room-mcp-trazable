import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de habitaciones (Suite Administración → Habitación, D-1…D-26).
 *
 * La **base de datos es la fuente única del maestro** (D-3): aquí vive el alta, la edición, los dos
 * estados (publicación y operativo, D-19), la galería (D-5/D-12/D-20) y el registro de publicaciones
 * ancladas (D-2/D-18). El repositorio **no** decide reglas de negocio (p. ej. los campos mínimos para
 * publicar): esas viven en el `CHECK` de la tabla y en la capa de API, de modo que cualquier camino de
 * escritura las respete.
 *
 * Sin PII: ni las habitaciones ni sus imágenes guardan datos de viajeros (ADR-20/RNF-30).
 */

/** Tipos de habitación admitidos (fijos, D-22). */
export type RoomTypeCode = "SIMPLE" | "DOBLE" | "SUITE";

/** Estado de publicación (lo decide el administrador, D-19). */
export type RoomPublicationStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "PAUSED"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE";

/** Estado operativo (lo actualizan housekeeping/recepción, D-19). */
export type RoomOperationalStatus = "CLEAN" | "DIRTY" | "OCCUPIED";

/** Dimensión del historial de estados. */
export type RoomStatusKind = "PUBLICATION" | "OPERATIONAL";

/** Habitación tal y como vive en `rooms`. */
export interface RoomRecord {
  id: string;
  roomNumber: number;
  floor: number | null;
  roomType: RoomTypeCode;
  capacity: number;
  beds: number;
  sizeM2: number | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  descriptionRu: string | null;
  /** Tarifa base en wei como cadena (NUMERIC(78,0)); `null` si no se fijó. */
  baseRateWei: string | null;
  publicationStatus: RoomPublicationStatus;
  operationalStatus: RoomOperationalStatus;
  /** `null` = vigente; con fecha = archivada y nunca borrada (D-8). */
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Imagen de la galería de una habitación. */
export interface RoomImageRecord {
  id: string;
  roomId: string;
  fileName: string;
  storagePath: string;
  position: number;
  isCover: boolean;
  altTextEs: string | null;
  altTextEn: string | null;
  altTextRu: string | null;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: Date;
}

/** Publicación anclada de una ficha (D-2/D-18). */
export interface RoomPublicationRecord {
  id: string;
  roomId: string;
  contentHash: string;
  txHash: string | null;
  onChainAnchored: boolean;
  /** Firma EIP-191 del administrador sobre `contentHash` (D-1/D-2); `null` si no se firmó. */
  signature: string | null;
  /** Dirección que firmó; `null` si no se firmó. */
  signerAddress: string | null;
  publishedBy: string;
  publishedAt: Date;
  unpublishedAt: Date | null;
}

/** Entrada del historial de estados (publicación u operativo). */
export interface RoomStatusHistoryRecord {
  id: string;
  roomId: string;
  statusKind: RoomStatusKind;
  fromValue: string | null;
  toValue: string;
  changedBy: string;
  reason: string | null;
  changedAt: Date;
}

export interface CreateRoomInput {
  roomNumber: number;
  floor?: number | null;
  roomType: RoomTypeCode;
  capacity: number;
  beds: number;
  sizeM2?: number | null;
  descriptionEs?: string | null;
  descriptionEn?: string | null;
  descriptionRu?: string | null;
  baseRateWei?: string | null;
}

export type UpdateRoomInput = Partial<CreateRoomInput>;

export interface AddRoomImageInput {
  roomId: string;
  fileName: string;
  storagePath: string;
  position: number;
  isCover?: boolean;
  altTextEs?: string | null;
  altTextEn?: string | null;
  altTextRu?: string | null;
  byteSize: number;
  uploadedBy: string;
}

export interface RecordRoomPublicationInput {
  roomId: string;
  contentHash: string;
  publishedBy: string;
  txHash?: string | null;
  signature?: string | null;
  signerAddress?: string | null;
}

/** Error de negocio reconocible por la API para devolver 409/400 con un código claro. */
export class RoomRepositoryError extends Error {
  constructor(
    readonly code: "ROOM_NUMBER_TAKEN" | "ROOM_NOT_FOUND" | "IMAGE_LIMIT" | "COVER_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "RoomRepositoryError";
  }
}

const ISBN_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === ISBN_UNIQUE_VIOLATION;
}

export class RoomsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /** Lista las habitaciones; por defecto excluye las archivadas (D-8). */
  async listRooms(options: { includeArchived?: boolean } = {}): Promise<RoomRecord[]> {
    const includeArchived = options.includeArchived === true;
    const res = await this.pool.query(
      `SELECT * FROM rooms
       ${includeArchived ? "" : "WHERE archived_at IS NULL"}
       ORDER BY room_number ASC`,
    );
    return res.rows.map(mapRoom);
  }

  async findById(id: string): Promise<RoomRecord | null> {
    const res = await this.pool.query("SELECT * FROM rooms WHERE id = $1", [id]);
    return res.rows.length > 0 ? mapRoom(res.rows[0]) : null;
  }

  async findByNumber(roomNumber: number): Promise<RoomRecord | null> {
    const res = await this.pool.query("SELECT * FROM rooms WHERE room_number = $1", [roomNumber]);
    return res.rows.length > 0 ? mapRoom(res.rows[0]) : null;
  }

  /**
   * Alta de habitación. El número es único (D-7); un duplicado se traduce a un error de negocio en
   * lugar de propagar el error crudo de PostgreSQL.
   */
  async createRoom(input: CreateRoomInput): Promise<RoomRecord> {
    try {
      const res = await this.pool.query(
        `INSERT INTO rooms (
            room_number, floor, room_type, capacity, beds, size_m2,
            description_es, description_en, description_ru, base_rate_wei
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.roomNumber,
          input.floor ?? null,
          input.roomType,
          input.capacity,
          input.beds,
          input.sizeM2 ?? null,
          input.descriptionEs ?? null,
          input.descriptionEn ?? null,
          input.descriptionRu ?? null,
          input.baseRateWei ?? null,
        ],
      );
      return mapRoom(res.rows[0]);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new RoomRepositoryError(
          "ROOM_NUMBER_TAKEN",
          `La habitación ${input.roomNumber} ya existe (el número no puede repetirse, D-7).`,
        );
      }
      throw error;
    }
  }

  /** Edición parcial de la ficha. Solo actualiza los campos presentes. */
  async updateRoom(id: string, input: UpdateRoomInput): Promise<RoomRecord | null> {
    const columnMap: ReadonlyArray<[keyof UpdateRoomInput, string]> = [
      ["roomNumber", "room_number"],
      ["floor", "floor"],
      ["roomType", "room_type"],
      ["capacity", "capacity"],
      ["beds", "beds"],
      ["sizeM2", "size_m2"],
      ["descriptionEs", "description_es"],
      ["descriptionEn", "description_en"],
      ["descriptionRu", "description_ru"],
      ["baseRateWei", "base_rate_wei"],
    ];

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of columnMap) {
      if (!(key in input)) continue;
      values.push(input[key] ?? null);
      sets.push(`${column} = $${values.length}`);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = NOW()");
    values.push(id);

    try {
      const res = await this.pool.query(
        `UPDATE rooms SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      return res.rows.length > 0 ? mapRoom(res.rows[0]) : null;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new RoomRepositoryError("ROOM_NUMBER_TAKEN", "Ya existe otra habitación con ese número (D-7).");
      }
      throw error;
    }
  }

  /**
   * Archiva la habitación (D-8): nunca se borra. Retira sus noches futuras de la venta mediante el
   * estado `OUT_OF_SERVICE`; las ya vendidas siguen válidas (D-23).
   */
  async archiveRoom(id: string, actor: string): Promise<RoomRecord | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const res = await this.pool.query(
      `UPDATE rooms
          SET archived_at = NOW(), publication_status = 'OUT_OF_SERVICE', updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    if (res.rows.length === 0) return null;

    await this.recordStatusChange(id, "PUBLICATION", current.publicationStatus, "OUT_OF_SERVICE", actor, "Archivada (D-8)");
    return mapRoom(res.rows[0]);
  }

  /** Cambia el estado de publicación y deja traza en el historial (D-19). */
  async setPublicationStatus(
    id: string,
    status: RoomPublicationStatus,
    actor: string,
    reason?: string,
  ): Promise<RoomRecord | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const res = await this.pool.query(
      `UPDATE rooms SET publication_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (res.rows.length === 0) return null;

    if (current.publicationStatus !== status) {
      await this.recordStatusChange(id, "PUBLICATION", current.publicationStatus, status, actor, reason ?? null);
    }
    return mapRoom(res.rows[0]);
  }

  /** Cambia el estado operativo (lo usan housekeeping/recepción, D-19). */
  async setOperationalStatus(
    id: string,
    status: RoomOperationalStatus,
    actor: string,
    reason?: string,
  ): Promise<RoomRecord | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const res = await this.pool.query(
      `UPDATE rooms SET operational_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status],
    );
    if (res.rows.length === 0) return null;

    if (current.operationalStatus !== status) {
      await this.recordStatusChange(id, "OPERATIONAL", current.operationalStatus, status, actor, reason ?? null);
    }
    return mapRoom(res.rows[0]);
  }

  /** Deja una entrada en `room_status_history`. */
  async recordStatusChange(
    roomId: string,
    statusKind: RoomStatusKind,
    fromValue: string | null,
    toValue: string,
    changedBy: string,
    reason: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO room_status_history (room_id, status_kind, from_value, to_value, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roomId, statusKind, fromValue, toValue, changedBy, reason],
    );
  }

  async listStatusHistory(roomId: string): Promise<RoomStatusHistoryRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM room_status_history WHERE room_id = $1 ORDER BY changed_at DESC`,
      [roomId],
    );
    return res.rows.map(mapStatusHistory);
  }

  // ---------------------------------------------------------------------------
  // Galería (D-5, D-12, D-20)
  // ---------------------------------------------------------------------------

  async listImages(roomId: string): Promise<RoomImageRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM room_images WHERE room_id = $1 ORDER BY position ASC`,
      [roomId],
    );
    return res.rows.map(mapImage);
  }

  async findImageById(id: string): Promise<RoomImageRecord | null> {
    const res = await this.pool.query("SELECT * FROM room_images WHERE id = $1", [id]);
    return res.rows.length > 0 ? mapImage(res.rows[0]) : null;
  }

  /**
   * Añade una imagen. Si la imagen es portada, retira la portada anterior de la misma habitación
   * (el índice único parcial solo admite una). El límite de 5 fotos lo impone el índice
   * `(room_id, position)` con `position` 1..5.
   */
  async addImage(input: AddRoomImageInput): Promise<RoomImageRecord> {
    if (input.position < 1 || input.position > 5) {
      throw new RoomRepositoryError("IMAGE_LIMIT", "La posición de la imagen debe estar entre 1 y 5 (D-20).");
    }
    if (input.isCover) {
      await this.pool.query(
        `UPDATE room_images SET is_cover = FALSE WHERE room_id = $1 AND is_cover = TRUE`,
        [input.roomId],
      );
    }
    try {
      const res = await this.pool.query(
        `INSERT INTO room_images (
            room_id, file_name, storage_path, position, is_cover,
            alt_text_es, alt_text_en, alt_text_ru, byte_size, uploaded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          input.roomId,
          input.fileName,
          input.storagePath,
          input.position,
          input.isCover ?? false,
          input.altTextEs ?? null,
          input.altTextEn ?? null,
          input.altTextRu ?? null,
          input.byteSize,
          input.uploadedBy,
        ],
      );
      return mapImage(res.rows[0]);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new RoomRepositoryError(
          "IMAGE_LIMIT",
          "Ya existe una imagen en esa posición para la habitación (máx. 5 fotos, D-20).",
        );
      }
      throw error;
    }
  }

  /** Marca una imagen como portada y retira la anterior. Devuelve `false` si no existe. */
  async setCoverImage(roomId: string, imageId: string): Promise<boolean> {
    const image = await this.findImageById(imageId);
    if (!image || image.roomId !== roomId) return false;

    await this.pool.query(
      `UPDATE room_images SET is_cover = FALSE WHERE room_id = $1 AND is_cover = TRUE`,
      [roomId],
    );
    const res = await this.pool.query(
      `UPDATE room_images SET is_cover = TRUE WHERE id = $1 AND room_id = $2`,
      [imageId, roomId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async deleteImage(id: string): Promise<boolean> {
    const res = await this.pool.query("DELETE FROM room_images WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Publicaciones ancladas (D-2, D-18)
  // ---------------------------------------------------------------------------

  async recordPublication(input: RecordRoomPublicationInput): Promise<RoomPublicationRecord> {
    const res = await this.pool.query(
      `INSERT INTO room_publications
          (room_id, content_hash, tx_hash, on_chain_anchored, signature, signer_address, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.roomId,
        input.contentHash,
        input.txHash ?? null,
        input.txHash != null,
        input.signature ?? null,
        input.signerAddress ?? null,
        input.publishedBy,
      ],
    );
    return mapPublication(res.rows[0]);
  }

  async markPublicationAnchored(publicationId: string, txHash: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE room_publications SET on_chain_anchored = TRUE, tx_hash = $2 WHERE id = $1`,
      [publicationId, txHash],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listPublications(roomId: string): Promise<RoomPublicationRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM room_publications WHERE room_id = $1 ORDER BY published_at DESC`,
      [roomId],
    );
    return res.rows.map(mapPublication);
  }
}

// -----------------------------------------------------------------------------
// Traducción snake_case → camelCase
// -----------------------------------------------------------------------------

function mapRoom(row: QueryResultRow): RoomRecord {
  return {
    id: row.id as string,
    roomNumber: row.room_number as number,
    floor: (row.floor as number | null) ?? null,
    roomType: row.room_type as RoomTypeCode,
    capacity: row.capacity as number,
    beds: row.beds as number,
    sizeM2: row.size_m2 === null || row.size_m2 === undefined ? null : Number(row.size_m2),
    descriptionEs: (row.description_es as string | null) ?? null,
    descriptionEn: (row.description_en as string | null) ?? null,
    descriptionRu: (row.description_ru as string | null) ?? null,
    baseRateWei: (row.base_rate_wei as string | null) ?? null,
    publicationStatus: row.publication_status as RoomPublicationStatus,
    operationalStatus: row.operational_status as RoomOperationalStatus,
    archivedAt: (row.archived_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

function mapImage(row: QueryResultRow): RoomImageRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    fileName: row.file_name as string,
    storagePath: row.storage_path as string,
    position: row.position as number,
    isCover: row.is_cover as boolean,
    altTextEs: (row.alt_text_es as string | null) ?? null,
    altTextEn: (row.alt_text_en as string | null) ?? null,
    altTextRu: (row.alt_text_ru as string | null) ?? null,
    mimeType: row.mime_type as string,
    byteSize: Number(row.byte_size),
    uploadedBy: row.uploaded_by as string,
    uploadedAt: row.uploaded_at as Date,
  };
}

function mapPublication(row: QueryResultRow): RoomPublicationRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    contentHash: row.content_hash as string,
    txHash: (row.tx_hash as string | null) ?? null,
    onChainAnchored: row.on_chain_anchored as boolean,
    signature: (row.signature as string | null) ?? null,
    signerAddress: (row.signer_address as string | null) ?? null,
    publishedBy: row.published_by as string,
    publishedAt: row.published_at as Date,
    unpublishedAt: (row.unpublished_at as Date | null) ?? null,
  };
}

function mapStatusHistory(row: QueryResultRow): RoomStatusHistoryRecord {
  return {
    id: row.id as string,
    roomId: row.room_id as string,
    statusKind: row.status_kind as RoomStatusKind,
    fromValue: (row.from_value as string | null) ?? null,
    toValue: row.to_value as string,
    changedBy: row.changed_by as string,
    reason: (row.reason as string | null) ?? null,
    changedAt: row.changed_at as Date,
  };
}
