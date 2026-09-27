import type { Pool } from "pg";
import { getDbPool } from "../pool";

/**
 * Ajustes de plataforma (tabla `platform_settings`).
 *
 * Persiste la configuración que el administrador puede cambiar sin desplegar: ventana de acuñado
 * (D-11), anticipo y plazo de la reserva (D-37) y hora límite del no-show (D-42). El repositorio
 * **no** siembra valores: `getNumber` devuelve el respaldo si la clave no existe, de modo que el
 * sistema funciona con los valores por defecto sin fila previa.
 */

/** Clave de la ventana global de acuñado en días (D-11). */
export const MINT_WINDOW_DAYS_KEY = "mint_window_days";
/** Porcentaje de anticipo de una reserva (D-37). */
export const RESERVATION_DEPOSIT_PERCENT_KEY = "reservation_deposit_percent";
/** Horas que una reserva retiene el inventario sin pago (D-37). */
export const RESERVATION_HOLD_HOURS_KEY = "reservation_hold_hours";
/** Hora límite de llegada (0-23) a partir de la cual una reserva confirmada es no-show (D-42). */
export const NO_SHOW_HOUR_KEY = "no_show_hour";

export class SettingsRepository {
  constructor(private pool: Pool = getDbPool()) {}

  /** Valor de un ajuste, o `null` si no existe. */
  async get(key: string): Promise<string | null> {
    const res = await this.pool.query(`SELECT value FROM platform_settings WHERE key = $1`, [key]);
    return res.rows.length > 0 ? (res.rows[0].value as string) : null;
  }

  /** Valor numérico de un ajuste; si falta o no es un número, devuelve `fallback`. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const raw = await this.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  /** Fija un ajuste (idempotente por clave). */
  async set(key: string, value: string, updatedBy?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO platform_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [key, value, updatedBy ?? null],
    );
  }
}
