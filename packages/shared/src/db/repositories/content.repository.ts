import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de **contenido público** de la home (F6 · D-66, D-69, D-70, D-73, D-74).
 *
 * Lee la galería (`hotel_images`) y los planes informativos (`hotel_offers`) que el administrador
 * gestiona desde el back-office. En esta primera entrega expone la **lectura** que necesita la
 * suite pública; la gestión (alta/edición) llega con el resto de F6.
 *
 * **Sin PII** (ADR-20/RNF-30): son imágenes y textos de marca; no hay datos de viajeros.
 */

/** Secciones de la galería de contenido (`hotel_images.section`). */
export type ContentSection = "HERO" | "SERVICES" | "EXPERIENCE" | "ACTIVITIES" | "CONTACT" | "OTHER";

export const CONTENT_SECTIONS: readonly ContentSection[] = [
  "HERO",
  "SERVICES",
  "EXPERIENCE",
  "ACTIVITIES",
  "CONTACT",
  "OTHER",
];

export interface HotelImageRecord {
  id: string;
  section: ContentSection;
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

export interface HotelOfferRecord {
  id: string;
  code: string;
  titleEs: string;
  titleEn: string | null;
  titleRu: string | null;
  bodyEs: string | null;
  bodyEn: string | null;
  bodyRu: string | null;
  imageId: string | null;
  imageFileName: string | null;
  validFrom: string | null;
  validTo: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ContentRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /** Imágenes de una sección (o de todas), ordenadas por posición. */
  async listImages(section?: ContentSection): Promise<HotelImageRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM hotel_images
        ${section ? "WHERE section = $1" : ""}
        ORDER BY section ASC, position ASC`,
      section ? [section] : [],
    );
    return res.rows.map(mapImage);
  }

  /**
   * Portada de una sección (la marcada `is_cover`), o la primera si no hay portada marcada.
   * Devuelve `null` cuando la sección no tiene imágenes: la home decide entonces su respaldo.
   */
  async findCoverImage(section: ContentSection): Promise<HotelImageRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM hotel_images
        WHERE section = $1
        ORDER BY is_cover DESC, position ASC
        LIMIT 1`,
      [section],
    );
    return res.rows.length > 0 ? mapImage(res.rows[0]) : null;
  }

  /**
   * Planes informativos vigentes (D-69): activos y, si se indica `onDate`, dentro de su ventana de
   * validez. `valid_from`/`valid_to` nulos significan «sin límite».
   */
  async listOffers(options: { activeOnly?: boolean; onDate?: string } = {}): Promise<HotelOfferRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (options.activeOnly !== false) where.push("o.active = TRUE");
    if (options.onDate) {
      values.push(options.onDate);
      where.push(`(o.valid_from IS NULL OR o.valid_from <= $${values.length}::date)`);
      values.push(options.onDate);
      where.push(`(o.valid_to IS NULL OR o.valid_to >= $${values.length}::date)`);
    }
    const res = await this.pool.query(
      `SELECT o.*, i.file_name AS image_file_name
         FROM hotel_offers o
         LEFT JOIN hotel_images i ON i.id = o.image_id
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY o.sort_order ASC, o.created_at ASC`,
      values,
    );
    return res.rows.map(mapOffer);
  }
}

function mapImage(row: QueryResultRow): HotelImageRecord {
  return {
    id: row.id as string,
    section: row.section as ContentSection,
    fileName: row.file_name as string,
    storagePath: row.storage_path as string,
    position: Number(row.position),
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

function mapOffer(row: QueryResultRow): HotelOfferRecord {
  return {
    id: row.id as string,
    code: row.code as string,
    titleEs: row.title_es as string,
    titleEn: (row.title_en as string | null) ?? null,
    titleRu: (row.title_ru as string | null) ?? null,
    bodyEs: (row.body_es as string | null) ?? null,
    bodyEn: (row.body_en as string | null) ?? null,
    bodyRu: (row.body_ru as string | null) ?? null,
    imageId: (row.image_id as string | null) ?? null,
    imageFileName: (row.image_file_name as string | null) ?? null,
    validFrom: row.valid_from === null || row.valid_from === undefined ? null : isoDate(row.valid_from),
    validTo: row.valid_to === null || row.valid_to === undefined ? null : isoDate(row.valid_to),
    sortOrder: Number(row.sort_order),
    active: row.active as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

/** Normaliza `DATE` (que `pg` devuelve como `Date` o cadena) a `YYYY-MM-DD`. */
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
