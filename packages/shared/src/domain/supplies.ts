/**
 * Dominio **puro** de suministros y alertas de stock (F8 · T8.1/T8.2/T8.6 · D-C33, CU-V-25/30).
 *
 * Reglas que fija:
 *   - La alerta se abre cuando `stock_qty <= threshold_qty` y el umbral es positivo; se cierra en
 *     cuanto el stock vuelve a superar el umbral (`CLOSED`). El umbral es **configurable por artículo**
 *     (`threshold_qty`, editable por el Ama de llaves/administración).
 *   - El **recordatorio es diario**: una alerta abierta recuerda cada `REMINDER_INTERVAL_HOURS` (24 h)
 *     usando `last_reminded_at` persistido (sobrevive a reinicios), no un contador en memoria.
 *   - La alerta no bloquea nada: es una señal de reposición, no un estado de habitación.
 */

export const SUPPLY_REMINDER_INTERVAL_HOURS = 24;

import type { SupplyAlertStatus } from "./operations-state";

export interface SupplyStockState {
  readonly stockQty: number;
  readonly thresholdQty: number;
}

/** ¿El artículo está en o por debajo de su umbral? Un umbral 0 significa «sin alerta». */
export function isBelowThreshold(state: SupplyStockState): boolean {
  return state.thresholdQty > 0 && state.stockQty <= state.thresholdQty;
}

/** Transición deseada de la alerta tras un cambio de stock. */
export function desiredAlertState(state: SupplyStockState): SupplyAlertStatus {
  return isBelowThreshold(state) ? "OPEN" : "CLOSED";
}

/** ¿Un stock por encima del umbral debe cerrar la alerta abierta? */
export function shouldCloseAlert(
  state: SupplyStockState,
  currentStatus: SupplyAlertStatus,
): boolean {
  return currentStatus === "OPEN" && !isBelowThreshold(state);
}

/** Próximo recordatorio a partir del último (`null` = nunca recordado: toca ya). */
export function nextReminderAt(
  lastRemindedAt: Date | null,
  intervalHours = SUPPLY_REMINDER_INTERVAL_HOURS,
): Date | null {
  if (lastRemindedAt === null) return null;
  return new Date(lastRemindedAt.getTime() + intervalHours * 3_600_000);
}

/** ¿Toca recordar esta alerta abierta ahora? */
export function isReminderDue(
  alert: { readonly status: SupplyAlertStatus; readonly lastRemindedAt: Date | null },
  now: Date = new Date(),
  intervalHours = SUPPLY_REMINDER_INTERVAL_HOURS,
): boolean {
  if (alert.status !== "OPEN") return false;
  if (alert.lastRemindedAt === null) return true;
  const next = nextReminderAt(alert.lastRemindedAt, intervalHours);
  return next !== null && now.getTime() >= next.getTime();
}

/** Porcentaje de reposición sugerido (contexto de UI): diferencia hasta el umbral, nunca negativa. */
export function suggestedRestockQty(state: SupplyStockState): number {
  if (!isBelowThreshold(state)) return 0;
  return Math.max(0, state.thresholdQty - state.stockQty);
}
