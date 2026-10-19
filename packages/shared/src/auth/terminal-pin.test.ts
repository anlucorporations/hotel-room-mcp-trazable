import { describe, expect, it } from "vitest";
import {
  TERMINAL_PIN_BCRYPT_COST,
  TERMINAL_PIN_LOCK_MINUTES,
  TERMINAL_SESSION_IDLE_MINUTES,
  TERMINAL_SESSION_MAX_HOURS,
  isPinExpired,
  isValidPinFormat,
  nextLockUntil,
  shouldLockAfterAttempt,
  terminalSessionState,
  touchTerminalSession,
  validatePin,
} from "./terminal-pin";

describe("política de PIN del terminal (F5 · T5.3)", () => {
  it("exige 4–6 dígitos y rechaza dígitos repetidos", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat("0000")).toBe(false);
    expect(isValidPinFormat("555555")).toBe(false);
    expect(validatePin("12a4")).toBe("El PIN solo admite dígitos.");
    expect(validatePin("123")).toContain("entre 4 y 6");
    expect(validatePin("1111")).toContain("dígito repetido");
    expect(validatePin("482913")).toBeNull();
  });

  it("bloquea a los 5 intentos con 15 minutos y bcrypt ≥12 (D-C17)", () => {
    expect(TERMINAL_PIN_BCRYPT_COST).toBeGreaterThanOrEqual(12);
    expect(TERMINAL_PIN_LOCK_MINUTES).toBe(15);
    expect(shouldLockAfterAttempt(4)).toBe(false);
    expect(shouldLockAfterAttempt(5)).toBe(true);
    const now = new Date("2026-10-19T10:00:00Z");
    expect(nextLockUntil(now).toISOString()).toBe("2026-10-19T10:15:00.000Z");
  });

  it("el PIN caduca a los 90 días y sin fecha se considera caducado", () => {
    const now = new Date("2026-10-19T00:00:00Z");
    expect(isPinExpired(null, now)).toBe(true);
    expect(isPinExpired(new Date("2026-10-18T00:00:00Z"), now)).toBe(false);
    expect(isPinExpired(new Date("2026-07-01T00:00:00Z"), now)).toBe(true);
  });

  it("la sesión caduca por 5 min de inactividad o a las 8 h", () => {
    const startedAt = new Date("2026-10-19T08:00:00Z");
    const now = new Date("2026-10-19T10:00:00Z");
    expect(terminalSessionState({ startedAt, lastActivityAt: now, now })).toBe("ACTIVE");
    expect(
      terminalSessionState({
        startedAt,
        lastActivityAt: new Date(now.getTime() - (TERMINAL_SESSION_IDLE_MINUTES + 1) * 60_000),
        now,
      }),
    ).toBe("IDLE_EXPIRED");
    expect(
      terminalSessionState({
        startedAt: new Date(now.getTime() - (TERMINAL_SESSION_MAX_HOURS + 1) * 3_600_000),
        lastActivityAt: now,
        now,
      }),
    ).toBe("MAX_AGE_EXPIRED");
    expect(touchTerminalSession({ startedAt, lastActivityAt: now, now })).toEqual(now);
    expect(
      touchTerminalSession({
        startedAt,
        lastActivityAt: new Date(now.getTime() - (TERMINAL_SESSION_IDLE_MINUTES + 1) * 60_000),
        now,
      }),
    ).toBeNull();
  });
});
