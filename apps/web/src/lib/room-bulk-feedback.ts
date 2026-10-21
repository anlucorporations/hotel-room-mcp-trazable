/**
 * Retroalimentación de la **publicación masiva** (2026-10-21).
 *
 * `POST /api/admin/rooms/bulk/publish` valida cada habitación por separado y devuelve un `results`
 * con el motivo de cada fallo. Hasta ahora la interfaz solo miraba `published` y, si era 0, enseñaba
 * un aviso genérico («No se pudieron publicar las habitaciones.»): el operador no sabía que, por
 * ejemplo, la causa era que las fichas no tenían foto (D-20).
 *
 * Esta función es **pura** —sin React ni acceso a la API— para poder probarla y para que el tablero
 * y la lista de habitaciones cuenten los fallos con el mismo criterio. El texto localizado lo compone
 * cada componente con las claves `admin.boardPublish*`.
 */

/** Forma mínima de una entrada de `results` (la del endpoint de publicación masiva). */
export interface BulkPublishResultLike {
  readonly ok?: boolean;
  readonly error?: string;
}

/** Recuento de la publicación masiva, agrupado por motivo de fallo. */
export interface BulkPublishFeedback {
  /** Habitaciones publicadas (según `published` del endpoint; si no llega, se cuentan los `ok`). */
  readonly published: number;
  /** Habitaciones que no se pudieron publicar. */
  readonly failed: number;
  /** Fallos por código de error (`PUBLISH_REQUIRES_IMAGE`, `PUBLISH_REQUIRES_DESCRIPTION`…). */
  readonly errors: Readonly<Record<string, number>>;
  /** Motivo más frecuente entre los fallos; `null` si no hubo ninguno. */
  readonly mainError: string | null;
}

/** Código que se usa cuando una entrada fallida no trae `error`. */
export const UNKNOWN_BULK_ERROR = "INTERNAL_SERVER_ERROR";

/**
 * Resume la respuesta de la publicación masiva.
 *
 * `published` es opcional: si el endpoint lo aporta, manda él; si no, se cuentan las entradas `ok`.
 */
export function summarizeBulkPublishResults(
  results: readonly BulkPublishResultLike[] | null | undefined,
  published?: number,
): BulkPublishFeedback {
  const entries = Array.isArray(results) ? results : [];
  const errors: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.ok === true) continue;
    const code = typeof entry.error === "string" && entry.error.length > 0 ? entry.error : UNKNOWN_BULK_ERROR;
    errors[code] = (errors[code] ?? 0) + 1;
  }

  const failed = entries.filter((entry) => entry.ok !== true).length;
  const okCount = entries.length - failed;
  let mainError: string | null = null;
  let mainCount = 0;
  // Se recorre el objeto en orden de inserción: en un empate gana el primer código visto.
  for (const [code, count] of Object.entries(errors)) {
    if (count > mainCount) {
      mainError = code;
      mainCount = count;
    }
  }

  return {
    published: typeof published === "number" && Number.isFinite(published) ? published : okCount,
    failed,
    errors,
    mainError,
  };
}

/** Códigos de fallo conocidos, en el orden en que se explican al operador. */
export const BULK_PUBLISH_ERROR_CODES = [
  "PUBLISH_REQUIRES_IMAGE",
  "PUBLISH_REQUIRES_DESCRIPTION",
  "ALREADY_PUBLISHED",
  "ALREADY_ARCHIVED",
  "ROOM_NOT_FOUND",
  UNKNOWN_BULK_ERROR,
] as const;

/** Códigos ordenados de mayor a menor número de fallos (los conocidos primero en caso de empate). */
export function bulkPublishErrorEntries(
  feedback: BulkPublishFeedback,
): Array<{ code: string; count: number }> {
  return Object.entries(feedback.errors)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      const indexA = BULK_PUBLISH_ERROR_CODES.indexOf(a.code as (typeof BULK_PUBLISH_ERROR_CODES)[number]);
      const indexB = BULK_PUBLISH_ERROR_CODES.indexOf(b.code as (typeof BULK_PUBLISH_ERROR_CODES)[number]);
      return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
    });
}
