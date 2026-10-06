import type { Pool, PoolClient, QueryResultRow } from "pg";
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

/** Estado operativo (lo actualizan housekeeping/recepción, D-19; RF-50 añade PENDING_CLEANING). */
export type RoomOperationalStatus = "CLEAN" | "DIRTY" | "OCCUPIED" | "PENDING_CLEANING";

/** Vista exterior de la habitación (ficha ampliada, 2026-10-02). */
export type RoomViewKind = "SEA" | "GARDEN" | "INTERIOR";

/** Estilo decorativo de la habitación (ficha ampliada, 2026-10-02). */
export type RoomDecorStyle = "MEDITERRANEAN" | "CONTEMPORARY" | "CLASSIC" | "RUSTIC" | "MINIMAL";

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
  // — Ficha ampliada (2026-10-02): físicas de la vista, accesibilidad y decoración —
  viewKind: RoomViewKind | null;
  hasBalcony: boolean;
  isAccessible: boolean;
  decorStyle: RoomDecorStyle | null;
  decorPalette: string | null;
  decorMaterials: string | null;
  decorNotesEs: string | null;
  decorNotesEn: string | null;
  decorNotesRu: string | null;
  publicationStatus: RoomPublicationStatus;
  operationalStatus: RoomOperationalStatus;
  /** `null` = vigente; con fecha = archivada y nunca borrada (D-8). */
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estado de una habitación en **un día** del tablero de disponibilidad (2026-10-04). Las tres
 * banderas son independientes: una habitación puede estar publicada y reservada el mismo día.
 */
export interface RoomDayStateRecord {
  roomId: string;
  /** Fecha UTC `YYYY-MM-DD`. */
  date: string;
  published: boolean;
  reserved: boolean;
  occupied: boolean;
}

/** Portada de una habitación, para resolver la foto por **número** (catálogo público). */
export interface RoomCoverImageRecord {
  roomNumber: number;
  fileName: string;
  altTextEs: string | null;
  altTextEn: string | null;
  altTextRu: string | null;
}

/** Espacio de una habitación (catálogo cerrado + superficie). */
export interface RoomSpaceRecord {
  spaceCode: string;
  sizeM2: number | null;
  sortOrder: number;
}

/** Entrada del catálogo de espacios (nombres trilingües). */
export interface RoomSpaceTypeRecord {
  code: string;
  nameEs: string;
  nameEn: string;
  nameRu: string;
  sortOrder: number;
}

/** Entrada del catálogo de servicios/amenidades. */
export interface RoomAmenityRecord {
  code: string;
  nameEs: string;
  nameEn: string;
  nameRu: string;
  sortOrder: number;
}

/** Entrada del catálogo de tipos de habitación. */
export interface RoomTypeRecord {
  code: RoomTypeCode;
  nameEs: string;
  nameEn: string;
  nameRu: string;
  baseCapacity: number;
  royaltyBps: number;
  sortOrder: number;
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
  // — Ficha ampliada (2026-10-02) —
  viewKind?: RoomViewKind | null;
  hasBalcony?: boolean;
  isAccessible?: boolean;
  decorStyle?: RoomDecorStyle | null;
  decorPalette?: string | null;
  decorMaterials?: string | null;
  decorNotesEs?: string | null;
  decorNotesEn?: string | null;
  decorNotesRu?: string | null;
}

export type UpdateRoomInput = Partial<CreateRoomInput>;

/**
 * Servicios y espacios no viven en `rooms` sino en tablas de enlace, así que se asignan con sus
 * propios métodos (`setRoomAmenities` / `setRoomSpaces`). La API los aplica **después** del alta: si
 * el segundo paso fallara, la habitación queda en `DRAFT` (nunca publicada a medias) y el operador
 * puede reintentar la edición sin perder la ficha.
 */
export interface SetRoomSpaceInput {
  spaceCode: string;
  sizeM2?: number | null;
}

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
            description_es, description_en, description_ru, base_rate_wei,
            view_kind, has_balcony, is_accessible,
            decor_style, decor_palette, decor_materials,
            decor_notes_es, decor_notes_en, decor_notes_ru
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
          input.viewKind ?? null,
          input.hasBalcony ?? false,
          input.isAccessible ?? false,
          input.decorStyle ?? null,
          input.decorPalette ?? null,
          input.decorMaterials ?? null,
          input.decorNotesEs ?? null,
          input.decorNotesEn ?? null,
          input.decorNotesRu ?? null,
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
      ["viewKind", "view_kind"],
      ["hasBalcony", "has_balcony"],
      ["isAccessible", "is_accessible"],
      ["decorStyle", "decor_style"],
      ["decorPalette", "decor_palette"],
      ["decorMaterials", "decor_materials"],
      ["decorNotesEs", "decor_notes_es"],
      ["decorNotesEn", "decor_notes_en"],
      ["decorNotesRu", "decor_notes_ru"],
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
        // `!= null` cubriría también `undefined`; se escribe explícito porque `eqeqeq` es bloqueante.
        input.txHash !== null && input.txHash !== undefined,
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

  // ---------------------------------------------------------------------------
  // Ficha ampliada (2026-10-02): catálogos, servicios, espacios y calendario
  // ---------------------------------------------------------------------------

  /** Catálogo de tipos de habitación (nombre trilingüe + royalty inmutable). */
  async listRoomTypes(): Promise<RoomTypeRecord[]> {
    const res = await this.pool.query(`SELECT * FROM room_types ORDER BY sort_order ASC`);
    return res.rows.map((row) => ({
      code: row.code as RoomTypeCode,
      nameEs: row.name_es as string,
      nameEn: row.name_en as string,
      nameRu: row.name_ru as string,
      baseCapacity: row.base_capacity as number,
      royaltyBps: row.royalty_bps as number,
      sortOrder: row.sort_order as number,
    }));
  }

  /** Catálogo de servicios/amenidades que el formulario puede ofrecer. */
  async listAmenityCatalog(): Promise<RoomAmenityRecord[]> {
    const res = await this.pool.query(`SELECT * FROM room_amenities ORDER BY sort_order ASC`);
    return res.rows.map((row) => ({
      code: row.code as string,
      nameEs: row.name_es as string,
      nameEn: row.name_en as string,
      nameRu: row.name_ru as string,
      sortOrder: row.sort_order as number,
    }));
  }

  /** Catálogo de espacios (dormitorio, baño, terraza…). */
  async listSpaceTypes(): Promise<RoomSpaceTypeRecord[]> {
    const res = await this.pool.query(`SELECT * FROM room_space_types ORDER BY sort_order ASC`);
    return res.rows.map((row) => ({
      code: row.code as string,
      nameEs: row.name_es as string,
      nameEn: row.name_en as string,
      nameRu: row.name_ru as string,
      sortOrder: row.sort_order as number,
    }));
  }

  /** Servicios asignados a una habitación (códigos del catálogo). */
  async listAmenityCodes(roomId: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT l.amenity_code
         FROM room_amenity_links l
         JOIN room_amenities a ON a.code = l.amenity_code
        WHERE l.room_id = $1
        ORDER BY a.sort_order ASC`,
      [roomId],
    );
    return res.rows.map((row) => row.amenity_code as string);
  }

  /**
   * Reemplaza los servicios de una habitación.
   *
   * **Por qué en transacción y en dos sentencias** (defecto detectado al validar contra PostgreSQL
   * real, 2026-10-02): con el `DELETE` y el `INSERT` en una sola sentencia (CTE), el `ON CONFLICT`
   * evalúa la **instantánea previa** al borrado, así que los códigos que ya estaban se saltaban y se
   * perdían. Dentro de una transacción, el `INSERT` sí ve el borrado anterior y el conjunto queda
   * exactamente como llega.
   */
  async setRoomAmenities(roomId: string, codes: readonly string[]): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query(`DELETE FROM room_amenity_links WHERE room_id = $1`, [roomId]);
      if (codes.length === 0) return;
      await client.query(
        `INSERT INTO room_amenity_links (room_id, amenity_code)
         SELECT $1, code FROM unnest($2::varchar[]) AS t(code)
         ON CONFLICT (room_id, amenity_code) DO NOTHING`,
        [roomId, [...codes]],
      );
    });
  }

  /** Espacios de una habitación con su superficie, en el orden del catálogo. */
  async listRoomSpaces(roomId: string): Promise<RoomSpaceRecord[]> {
    const res = await this.pool.query(
      `SELECT s.space_code, s.size_m2, s.sort_order
         FROM room_spaces s
         JOIN room_space_types t ON t.code = s.space_code
        WHERE s.room_id = $1
        ORDER BY t.sort_order ASC`,
      [roomId],
    );
    return res.rows.map((row) => ({
      spaceCode: row.space_code as string,
      sizeM2: row.size_m2 === null || row.size_m2 === undefined ? null : Number(row.size_m2),
      sortOrder: row.sort_order as number,
    }));
  }

  /** Reemplaza los espacios de una habitación (misma transacción y mismo motivo que los servicios). */
  async setRoomSpaces(roomId: string, spaces: readonly SetRoomSpaceInput[]): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query(`DELETE FROM room_spaces WHERE room_id = $1`, [roomId]);
      if (spaces.length === 0) return;
      await client.query(
        `INSERT INTO room_spaces (room_id, space_code, size_m2, sort_order)
         SELECT $1, code, size, ord
           FROM unnest($2::varchar[], $3::numeric[], $4::int[]) AS t(code, size, ord)`,
        [
          roomId,
          spaces.map((space) => space.spaceCode),
          spaces.map((space) => space.sizeM2 ?? null),
          spaces.map((_, index) => index + 1),
        ],
      );
    });
  }

  /**
   * Ejecuta varias sentencias en una transacción sobre el **pool inyectado** (no el global): los
   * tests doblan el pool y así siguen pudiendo hacerlo.
   */
  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Noches **reservadas o vendidas** de una habitación en una ventana (para el calendario de la
   * ficha). Se unen las dos fuentes que el sistema considera «ocupada»:
   *
   *   · `reservation_nights` con una reserva viva (`PENDING`/`CONFIRMED`/`COMPLETED`);
   *   · `nfts` con estado distinto de `AVAILABLE` (`SOLD`, `CONFIRMING`, `CHECKED_IN`, `BURNED`).
   *
   * Se devuelven como fechas `YYYY-MM-DD` ordenadas y sin repetir.
   */
  async listReservedNights(roomId: string, from: string, to: string): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT to_char(night, 'YYYY-MM-DD') AS night
         FROM (
           SELECT rn.night_date AS night
             FROM reservation_nights rn
             JOIN reservations r ON r.id = rn.reservation_id
            WHERE rn.room_id = $1
              AND rn.night_date BETWEEN $2::date AND $3::date
              AND r.status IN ('PENDING', 'CONFIRMED', 'COMPLETED')
           UNION ALL
           SELECT n.check_in_date AS night
             FROM nfts n
             JOIN rooms ro ON ro.room_number = n.room_number
            WHERE ro.id = $1
              AND n.check_in_date BETWEEN $2::date AND $3::date
              AND n.status <> 'AVAILABLE'
         ) AS ocupadas
        ORDER BY night ASC`,
      [roomId, from, to],
    );
    return res.rows.map((row) => row.night as string);
  }

  /**
   * **Conteo masivo de noches ocupadas por habitación** (2026-10-04, tablero Admin): permite saber
   * en una sola consulta si cada habitación del listado tiene reservas vivas dentro de la ventana
   * sin disparar una query por fila. Mismas dos fuentes que `listReservedNights`:
   *
   *   · `reservation_nights` con reserva viva (`PENDING`/`CONFIRMED`/`COMPLETED`);
   *   · `nfts` con estado distinto de `AVAILABLE`.
   *
   * Devuelve `roomId → nº de noches distintas`; las habitaciones sin ninguna noche no aparecen en el
   * mapa (el caller trata la ausencia como 0).
   */
  async countReservedNightsByRooms(
    roomIds: readonly string[],
    from: string,
    to: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (roomIds.length === 0) return result;
    const ids = [...new Set(roomIds)];
    const res = await this.pool.query(
      `SELECT ro.id AS room_id, COUNT(DISTINCT night) AS nights
         FROM (
           SELECT rn.room_id AS room_id, rn.night_date AS night
             FROM reservation_nights rn
             JOIN reservations r ON r.id = rn.reservation_id
            WHERE rn.room_id = ANY($1::uuid[])
              AND rn.night_date BETWEEN $2::date AND $3::date
              AND r.status IN ('PENDING', 'CONFIRMED', 'COMPLETED')
           UNION ALL
           SELECT ro2.id AS room_id, n.check_in_date AS night
             FROM nfts n
             JOIN rooms ro2 ON ro2.room_number = n.room_number
            WHERE ro2.id = ANY($1::uuid[])
              AND n.check_in_date BETWEEN $2::date AND $3::date
              AND n.status <> 'AVAILABLE'
         ) AS ocupadas
         JOIN rooms ro ON ro.id = ocupadas.room_id
        GROUP BY ro.id`,
      [ids, from, to],
    );
    for (const row of res.rows) {
      // `COUNT()` es `bigint`: node-postgres lo entrega como CADENA. Se convierte aquí para que la API
      // publique un número real — si viajara "0", las reglas del tablero (`=== 0`) fallarían (2026-10-04).
      result.set(row.room_id as string, Number(row.nights));
    }
    return result;
  }

  /**
   * **Reservas liberables de una habitación** (2026-10-04, acción masiva «Liberar»): ids de las
   * reservas **activas** (`PENDING`/`CONFIRMED`) que tienen al menos una noche dentro de la ventana.
   *
   * Solo estas dos son cancelables: `COMPLETED` ya está liquidada y los `nfts` (noches minted) no se
   * cancelan por la vía de reservas. Vacío = nada que liberar.
   */
  async listReleaseableReservationIds(
    roomId: string,
    from: string,
    to: string,
  ): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT DISTINCT r.id AS reservation_id
         FROM reservations r
         JOIN reservation_nights rn ON rn.reservation_id = r.id
        WHERE rn.room_id = $1
          AND r.status IN ('PENDING', 'CONFIRMED')
          AND rn.night_date BETWEEN $2::date AND $3::date
        ORDER BY r.id`,
      [roomId, from, to],
    );
    return res.rows.map((row) => row.reservation_id as string);
  }

  /**
   * **Estado por habitación y día** para el tablero de disponibilidad (2026-10-04,
   * `CalendarioHabitaciones`): mapa **disperso** —solo aparecen las parejas habitación/día con algún
   * estado— con tres banderas independientes. Una misma habitación y día puede estar `published` y
   * `reserved` a la vez (como la clase «AMBAS» del calendario por habitación).
   *
   *   · `published`: el día cae dentro de una ventana `[published_at, unpublished_at]` (extremos
   *     inclusive; `unpublished_at` nulo = ventana abierta), igual que `lib/room-calendar.ts`.
   *   · `reserved`: noche de una reserva **viva** (`PENDING`/`CONFIRMED`).
   *   · `occupied`: noche ya `COMPLETED` (estancia pasada) o con un token no `AVAILABLE`
   *     (`SOLD`/`CONFIRMING`/`CHECKED_IN`/`BURNED`).
   *
   * El **mantenimiento** no se resuelve aquí: no tiene día programado y viaja aparte
   * (`listRoomIdsInMaintenance`).
   */
  async listRoomDayStates(from: string, to: string): Promise<RoomDayStateRecord[]> {
    const res = await this.pool.query(
      `SELECT room_id, to_char(night, 'YYYY-MM-DD') AS day,
              bool_or(published) AS published,
              bool_or(reserved) AS reserved,
              bool_or(occupied) AS occupied
         FROM (
           SELECT rp.room_id AS room_id, d::date AS night,
                  TRUE AS published, FALSE AS reserved, FALSE AS occupied
             FROM room_publications rp
             CROSS JOIN LATERAL generate_series(
               GREATEST(rp.published_at::date, $1::date),
               LEAST(COALESCE(rp.unpublished_at::date, $2::date), $2::date),
               INTERVAL '1 day'
             ) AS d
            WHERE rp.published_at::date <= $2::date
              AND COALESCE(rp.unpublished_at::date, $2::date) >= $1::date
           UNION ALL
           SELECT rn.room_id, rn.night_date, FALSE, TRUE, FALSE
             FROM reservation_nights rn
             JOIN reservations r ON r.id = rn.reservation_id
            WHERE r.status IN ('PENDING', 'CONFIRMED')
              AND rn.night_date BETWEEN $1::date AND $2::date
           UNION ALL
           SELECT rn.room_id, rn.night_date, FALSE, FALSE, TRUE
             FROM reservation_nights rn
             JOIN reservations r ON r.id = rn.reservation_id
            WHERE r.status = 'COMPLETED'
              AND rn.night_date BETWEEN $1::date AND $2::date
           UNION ALL
           SELECT ro.id, n.check_in_date, FALSE, FALSE, TRUE
             FROM nfts n
             JOIN rooms ro ON ro.room_number = n.room_number
            WHERE n.status <> 'AVAILABLE'
              AND n.check_in_date BETWEEN $1::date AND $2::date
         ) AS estados
        GROUP BY room_id, night
        ORDER BY night ASC, room_id ASC`,
      [from, to],
    );
    return res.rows.map((row) => ({
      roomId: row.room_id as string,
      date: row.day as string,
      published: row.published === true,
      reserved: row.reserved === true,
      occupied: row.occupied === true,
    }));
  }

  /**
   * **Habitaciones en mantenimiento** (2026-10-04): publicación en `MAINTENANCE` o incidencia
   * **abierta** que bloquea la venta (`blocks_sale`). Se devuelve como bandera de estado **actual**
   * —las incidencias no tienen día programado—, así que el tablero la pinta en todos los días de la
   * vista y se documenta como limitación conocida.
   */
  async listRoomIdsInMaintenance(): Promise<string[]> {
    const res = await this.pool.query(
      `SELECT id FROM rooms
        WHERE archived_at IS NULL AND publication_status = 'MAINTENANCE'
        UNION
       SELECT DISTINCT room_id FROM maintenance_incidents
        WHERE status IN ('OPEN', 'IN_PROGRESS') AND blocks_sale = TRUE`,
    );
    return res.rows.map((row) => row.id as string);
  }
  /**
   * **Portada por número de habitación** (2026-10-05): una sola consulta para el catálogo público,
   * que conoce la habitación por su **número** (viene de la cadena) y no por su UUID.
   *
   * Se elige la marcada como portada y, si no hay, la de menor posición. Se ignoran las archivadas.
   * Devuelve un mapa `roomNumber → portada`; las habitaciones sin foto no aparecen (el catálogo cae
   * entonces a su imagen de reserva).
   */
  async listCoverImagesByRoomNumbers(
    roomNumbers: readonly number[],
  ): Promise<Map<number, RoomCoverImageRecord>> {
    const covers = new Map<number, RoomCoverImageRecord>();
    const numbers = [...new Set(roomNumbers)];
    if (numbers.length === 0) return covers;
    const res = await this.pool.query(
      `SELECT DISTINCT ON (r.room_number)
              r.room_number, i.file_name, i.alt_text_es, i.alt_text_en, i.alt_text_ru
         FROM rooms r
         JOIN room_images i ON i.room_id = r.id
        WHERE r.room_number = ANY($1::int[]) AND r.archived_at IS NULL
        ORDER BY r.room_number, i.is_cover DESC, i.position ASC`,
      [numbers],
    );
    for (const row of res.rows) {
      covers.set(row.room_number as number, {
        roomNumber: row.room_number as number,
        fileName: row.file_name as string,
        altTextEs: (row.alt_text_es as string | null) ?? null,
        altTextEn: (row.alt_text_en as string | null) ?? null,
        altTextRu: (row.alt_text_ru as string | null) ?? null,
      });
    }
    return covers;
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
    // Ficha ampliada (2026-10-02).
    viewKind: (row.view_kind as RoomViewKind | null) ?? null,
    hasBalcony: (row.has_balcony as boolean | null) ?? false,
    isAccessible: (row.is_accessible as boolean | null) ?? false,
    decorStyle: (row.decor_style as RoomDecorStyle | null) ?? null,
    decorPalette: (row.decor_palette as string | null) ?? null,
    decorMaterials: (row.decor_materials as string | null) ?? null,
    decorNotesEs: (row.decor_notes_es as string | null) ?? null,
    decorNotesEn: (row.decor_notes_en as string | null) ?? null,
    decorNotesRu: (row.decor_notes_ru as string | null) ?? null,
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
