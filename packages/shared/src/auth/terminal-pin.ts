/**
 * Política del **PIN de terminal** (F5 · T5.3 · D-C17/D-C30/D-C35/RNF-M-09/17/18/20).
 *
 * Los técnicos y camareras operan sin wallet en un terminal fijo: se identifican con un PIN corto.
 * Este módulo es dominio puro (sin `pg` ni bcrypt) para que la política se pruebe de forma
 * determinista; el hash real lo aplica el servicio con bcrypt coste ≥ 12.
 *
 * Reglas que fija:
 *   - PIN de **4–6 dígitos** (solo dígitos; nada de fechas repetidas triviales como `0000`).
 *   - **5 intentos fallidos** → bloqueo temporal de **15 minutos** (`locked_until`).
 *   - El PIN caduca a los **90 días** (`pin_changed_at`) y **debe cambiarse en el primer uso**
 *     (`must_change_pin`), porque lo fija el administrador.
 *   - La sesión del terminal expira por **inactividad de 5 minutos** y nunca dura más de 8 h.
 */

export const TERMINAL_PIN_MIN_LENGTH = 4;
export const TERMINAL_PIN_MAX_LENGTH = 6;
export const TERMINAL_PIN_MAX_ATTEMPTS = 5;
export const TERMINAL_PIN_LOCK_MINUTES = 15;
export const TERMINAL_PIN_MAX_AGE_DAYS = 90;
export const TERMINAL_PIN_BCRYPT_COST = 12;
/** Inactividad máxima de la sesión de terminal (5 min) y tope absoluto (8 h). */
export const TERMINAL_SESSION_IDLE_MINUTES = 5;
export const TERMINAL_SESSION_MAX_HOURS = 8;

const PIN_PATTERN = /^\d{4,6}$/;

/** ¿El PIN tiene la forma admitida? (4–6 dígitos, sin `0000`, `1111`… triviales). */
export function isValidPinFormat(pin: string): boolean {
  if (!PIN_PATTERN.test(pin)) return false;
  const allSame = pin.split("").every((digit) => digit === pin[0]);
  return !allSame;
}

/** Motivo legible del rechazo de formato, o `null` si es válido. */
export function validatePin(pin: string): string | null {
  if (pin.length < TERMINAL_PIN_MIN_LENGTH || pin.length > TERMINAL_PIN_MAX_LENGTH) {
    return `El PIN debe tener entre ${TERMINAL_PIN_MIN_LENGTH} y ${TERMINAL_PIN_MAX_LENGTH} dígitos.`;
  }
  if (!/^\d+$/.test(pin)) return "El PIN solo admite dígitos.";
  if (!isValidPinFormat(pin)) return "El PIN no puede ser un dígito repetido.";
  return null;
}

/** ¿El intento fallido debe bloquear la cuenta? El repositorio incrementa y bloquea de forma atómica. */
export function shouldLockAfterAttempt(failedAttempts: number): boolean {
  return failedAttempts >= TERMINAL_PIN_MAX_ATTEMPTS;
}

/** `locked_until` para el bloqueo por intentos. */
export function nextLockUntil(now: Date = new Date(), lockMinutes = TERMINAL_PIN_LOCK_MINUTES): Date {
  return new Date(now.getTime() + lockMinutes * 60_000);
}

/** ¿El PIN ha caducado (90 días desde el cambio)? Sin fecha, se considera caducado. */
export function isPinExpired(
  pinChangedAt: Date | null,
  now: Date = new Date(),
  maxAgeDays = TERMINAL_PIN_MAX_AGE_DAYS,
): boolean {
  if (pinChangedAt === null) return true;
  return now.getTime() - pinChangedAt.getTime() >= maxAgeDays * 86_400_000;
}

/** Estado de la sesión de terminal según la última actividad. */
export type TerminalSessionState = "ACTIVE" | "IDLE_EXPIRED" | "MAX_AGE_EXPIRED";

/** Evalúa si la sesión sigue viva (inactividad 5 min, tope absoluto 8 h). */
export function terminalSessionState(input: {
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
  readonly now?: Date;
}): TerminalSessionState {
  const now = input.now ?? new Date();
  const elapsedMs = now.getTime() - input.startedAt.getTime();
  if (elapsedMs >= TERMINAL_SESSION_MAX_HOURS * 3_600_000) return "MAX_AGE_EXPIRED";
  const idleMs = now.getTime() - input.lastActivityAt.getTime();
  if (idleMs > TERMINAL_SESSION_IDLE_MINUTES * 60_000) return "IDLE_EXPIRED";
  return "ACTIVE";
}

/** Toca la sesión si está viva; devuelve `null` si ya no lo está (la API responderá 401). */
export function touchTerminalSession(input: {
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
  readonly now?: Date;
}): Date | null {
  return terminalSessionState(input) === "ACTIVE" ? (input.now ?? new Date()) : null;
}
