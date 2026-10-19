import "server-only";
import {
  TERMINAL_PIN_LOCK_MINUTES,
  TERMINAL_PIN_MAX_ATTEMPTS,
  TerminalOperatorsRepository,
  isPinExpired,
  hashTerminalPin,
  isValidPinFormat,
  verifyTerminalPin,
} from "@hotel/shared";
import type { TerminalOperatorRecord } from "@hotel/shared";
import type { TerminalSession } from "./terminal-session";

/**
 * Autenticación por PIN del terminal (F5 · T5.3/T5.4 · D-C17/D-C30).
 *
 * Reglas aplicadas aquí (la política pura vive en `@hotel/shared/auth/terminal-pin`):
 *   - 5 intentos fallidos → `locked_until` 15 min, incrementado **atómicamente** por el repositorio.
 *   - PIN caducado (90 días) → se exige rotación antes de operar.
 *   - `must_change_pin` → el administrador fijó el PIN; el primer uso obliga a cambiarlo.
 *   - Un PIN correcto limpia intentos y bloqueo.
 */

const operators = new TerminalOperatorsRepository();

export type TerminalAuthOutcome =
  | {
      ok: true;
      session: TerminalSession;
      operator: TerminalOperatorRecord;
      mustChangePin: boolean;
      pinExpired: boolean;
    }
  | { ok: false; reason: "unknown" | "inactive" | "locked" | "invalid_pin"; message: string; retryAfterSeconds?: number };

export async function authenticateTerminalPin(
  username: string,
  pin: string,
): Promise<TerminalAuthOutcome> {
  const operator = await operators.findByUsername(username.trim().toLowerCase());
  if (!operator) return { ok: false, reason: "unknown", message: "Operario o PIN no válidos." };
  if (!operator.active) return { ok: false, reason: "inactive", message: "El operario está de baja." };

  const now = new Date();
  if (operator.lockedUntil !== null && operator.lockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: "locked",
      message: "Terminal bloqueado por intentos fallidos. Pide a tu jefe que lo desbloquee.",
      retryAfterSeconds: Math.ceil((operator.lockedUntil.getTime() - now.getTime()) / 1_000),
    };
  }

  const matches = await verifyTerminalPin(pin, operator.pinHash);
  if (!matches) {
    const attempt = await operators.registerFailedAttempt(operator.id, {
      maxAttempts: TERMINAL_PIN_MAX_ATTEMPTS,
      lockMinutes: TERMINAL_PIN_LOCK_MINUTES,
    });
    return {
      ok: false,
      reason: attempt.locked ? "locked" : "invalid_pin",
      message: attempt.locked
        ? "Demasiados intentos: terminal bloqueado 15 minutos."
        : "Operario o PIN no válidos.",
      ...(attempt.locked ? { retryAfterSeconds: TERMINAL_PIN_LOCK_MINUTES * 60 } : {}),
    };
  }

  await operators.resetFailedAttempts(operator.id);
  const pinExpired = isPinExpired(operator.pinChangedAt, now);
  return {
    ok: true,
    operator,
    mustChangePin: operator.mustChangePin || pinExpired,
    pinExpired,
    session: {
      kind: "terminal",
      operatorId: operator.id,
      username: operator.username,
      fullName: operator.fullName,
      role: operator.role,
      startedAt: now.toISOString(),
    },
  };
}

export type ChangePinOutcome =
  | { ok: true; operator: TerminalOperatorRecord }
  | { ok: false; message: string };

/** Rotación de PIN (primer uso, caducidad o petición del operario). */
export async function changeTerminalPin(
  operatorId: string,
  newPin: string,
): Promise<ChangePinOutcome> {
  if (!isValidPinFormat(newPin)) {
    return { ok: false, message: "PIN no válido: 4–6 dígitos y no puede ser un dígito repetido." };
  }
  const pinHash = await hashTerminalPin(newPin);
  const operator = await operators.changePin(operatorId, { pinHash, mustChangePin: false });
  return { ok: true, operator };
}
