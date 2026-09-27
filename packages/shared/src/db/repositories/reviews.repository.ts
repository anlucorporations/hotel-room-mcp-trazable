import type { Pool, QueryResultRow } from "pg";
import { getDbPool } from "../pool";

/**
 * Repositorio de **reseñas** (F6 · D-27, D-28, D-58, D-59).
 *
 * En esta primera entrega expone la **lectura pública** que necesita la home: las reseñas
 * `APPROVED` y su **nota media**. Las reseñas son **anónimas**: se publica la nota, el comentario y
 * el **tipo** de habitación, **nunca** el número exacto ni datos del huésped (RNF-30).
 *
 * El alta firmada (EIP-712 del titular de una noche consumida) y la **moderación previa** por el
 * administrador (`PENDING` → `APPROVED`/`REJECTED`) llegan en el siguiente incremento de F6; aquí
 * se deja ya la consulta por estado que necesita esa pantalla.
 */

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export const REVIEW_STATUSES: readonly ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export interface ReviewRecord {
  id: string;
  roomType: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: Date;
  moderatedBy: string | null;
  moderatedAt: Date | null;
}

export interface ReviewsSummary {
  average: number | null;
  count: number;
}

export class ReviewsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /**
   * Reseñas publicables (D-58: solo las `APPROVED`), de la más reciente a la más antigua. **No**
   * expone `token_id` ni `room_id`: la reseña es anónima.
   */
  async listApproved(limit = 12): Promise<ReviewRecord[]> {
    const res = await this.pool.query(
      `SELECT id, room_type, rating, comment, status, created_at, moderated_by, moderated_at
         FROM reviews
        WHERE status = 'APPROVED'
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.rows.map(mapReview);
  }

  /** Nota media y número de reseñas aprobadas; media `null` si todavía no hay ninguna. */
  async summary(): Promise<ReviewsSummary> {
    const res = await this.pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 2) AS average, COUNT(*)::int AS count
         FROM reviews WHERE status = 'APPROVED'`,
    );
    const row = res.rows[0] ?? {};
    const average = row.average === null || row.average === undefined ? null : Number(row.average);
    return { average, count: Number(row.count ?? 0) };
  }

  /** Reseñas por estado (moderación, D-58). Lista vacía si no hay. */
  async listByStatus(status: ReviewStatus, limit = 50): Promise<ReviewRecord[]> {
    const res = await this.pool.query(
      `SELECT id, room_type, rating, comment, status, created_at, moderated_by, moderated_at
         FROM reviews
        WHERE status = $1
        ORDER BY created_at ASC
        LIMIT $2`,
      [status, limit],
    );
    return res.rows.map(mapReview);
  }
}

function mapReview(row: QueryResultRow): ReviewRecord {
  return {
    id: row.id as string,
    roomType: row.room_type as string,
    rating: Number(row.rating),
    comment: (row.comment as string | null) ?? null,
    status: row.status as ReviewStatus,
    createdAt: row.created_at as Date,
    moderatedBy: (row.moderated_by as string | null) ?? null,
    moderatedAt: (row.moderated_at as Date | null) ?? null,
  };
}
