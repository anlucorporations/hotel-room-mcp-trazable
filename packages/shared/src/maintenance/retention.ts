import type { Pool } from "pg";
import { getDbPool } from "../db/pool";
import { purgeOldNotifications } from "../db/migrator";
import { DEFAULT_NO_SHOW_HOUR, ReservationsRepository } from "../db/repositories/reservations.repository";
import { NO_SHOW_HOUR_KEY, SettingsRepository } from "../db/repositories/settings.repository";

/**
 * Retención de datos (M9 · ADR-24).
 *
 * Hasta M9 los plazos de conservación estaban **escritos y no se cumplían**: `purgeOldNotifications`
 * existía desde la construcción inicial y **no la invocaba nadie**, y las sesiones de operadores no
 * se borraban nunca. La minimización de datos (RGPD art. 5.1.e) exige que un plazo declarado se
 * ejecute, así que aquí viven las dos operaciones y el worker las ejecuta periodicamente.
 *
 * Decisiones que fija este módulo:
 *   - **Sesiones**: se borran las que ya han **caducado** (su refresh no puede ser válido). La traza
 *     de acceso ya está pseudonimizada (HMAC) y desaparece con la fila: retención efectiva = 7 días,
 *     el plazo del refresh, en lugar de indefinida.
 *   - **Códigos de rescate** de operadores que ya no existen: no tiene sentido conservarlos.
 *   - **Notificaciones** enviadas con más de `notificationsRetentionDays` (90 por defecto).
 *
 * Nada de esto toca datos de compradores: la plataforma no los guarda.
 */

export interface PurgeResult {
  /** Sesiones caducadas eliminadas. */
  readonly expiredSessions: number;
  /** Códigos de rescate huérfanos eliminados. */
  readonly orphanRecoveryCodes: number;
  /** Notificaciones enviadas eliminadas por superar el plazo. */
  readonly oldNotifications: number;
  /** Reservas con el bloqueo de anticipo vencido, liberadas (D-37). */
  readonly expiredHolds: number;
  /** Reservas confirmadas sin presentarse, marcadas como no-show (D-42). */
  readonly noShows: number;
  /** Contactos de reservas ya terminadas, purgados (D-55). */
  readonly purgedContacts: number;
  /** Instante en que se ejecutó la limpieza. */
  readonly executedAt: string;
}

export interface RetentionOptions {
  /** Días que se conservan las notificaciones **enviadas** (90 por defecto). */
  readonly notificationsRetentionDays?: number;
  /** Pool inyectable (pruebas herméticas). */
  readonly pool?: Pool;
}

/** Borra las sesiones caducadas y devuelve cuántas filas se han eliminado. */
async function purgeExpiredSessions(pool: Pool): Promise<number> {
  const res = await pool.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
  return res.rowCount ?? 0;
}

/**
 * Borra los códigos de rescate de operadores que ya no existen.
 *
 * `mfa_recovery_codes` se guarda por `username` y no tiene clave foránea: al dar de baja a un
 * operador sus códigos quedarían vivos para siempre.
 */
async function purgeOrphanRecoveryCodes(pool: Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM mfa_recovery_codes c
      WHERE NOT EXISTS (SELECT 1 FROM admin_users u WHERE u.username = c.username)`,
  );
  return res.rowCount ?? 0;
}

/**
 * Ejecuta las tres limpiezas en una sola pasada y devuelve el recuento.
 *
 * No usa transacción a propósito: son borrados independientes y un fallo en uno no debe impedir que
 * los otros dos se apliquen. El resultado se registra para que el efecto sea auditable.
 */
export async function purgeExpiredData(options: RetentionOptions = {}): Promise<PurgeResult> {
  const pool = options.pool ?? getDbPool();
  const days = options.notificationsRetentionDays ?? 90;

  const expiredSessions = await purgeExpiredSessions(pool);
  const orphanRecoveryCodes = await purgeOrphanRecoveryCodes(pool);
  const oldNotifications = await purgeOldNotifications(days, pool);

  // Reservas (F2): liberar bloqueos vencidos, marcar no-shows y purgar contactos de estancias
  // terminadas. Son operaciones independientes: un fallo en una no impide las demás.
  const reservations = new ReservationsRepository(pool);
  const settings = new SettingsRepository(pool);
  // D-42: la hora límite del no-show es configurable; sin fila, el respaldo (18:00 UTC).
  const noShowHour = await settings.getNumber(NO_SHOW_HOUR_KEY, DEFAULT_NO_SHOW_HOUR);
  const expiredHolds = await reservations.expireHolds();
  const noShows = await reservations.markNoShows(new Date(), noShowHour);
  const purgedContacts = await reservations.purgeContacts();

  return {
    expiredSessions,
    orphanRecoveryCodes,
    oldNotifications,
    expiredHolds,
    noShows,
    purgedContacts,
    executedAt: new Date().toISOString(),
  };
}
