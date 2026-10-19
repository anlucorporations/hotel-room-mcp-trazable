import { describe, expect, it } from "vitest";
import {
  VALIDATION_SLA_HOURS,
  canValidate,
  escalationSummary,
  isValidationExpired,
  validationRemainingMs,
  validationStatusFor,
} from "./validation-sla";

describe("SLA de validación del jefe (F8 · RNF-M-21)", () => {
  const closedAt = new Date("2026-10-19T08:00:00Z");

  it("el SLA son 24 h", () => {
    expect(VALIDATION_SLA_HOURS).toBe(24);
    expect(isValidationExpired(closedAt, new Date("2026-10-20T07:59:00Z"))).toBe(false);
    expect(isValidationExpired(closedAt, new Date("2026-10-20T08:00:00Z"))).toBe(true);
    expect(isValidationExpired(null)).toBe(false);
  });

  it("proyecta PENDING_VERIFICATION y su vencimiento sin pisar VALIDATED", () => {
    expect(validationStatusFor(closedAt, null, new Date("2026-10-19T10:00:00Z"))).toBe("PENDING_VERIFICATION");
    expect(validationStatusFor(closedAt, null, new Date("2026-10-20T10:00:00Z"))).toBe("PENDING_VERIFICATION_EXPIRED");
    expect(validationStatusFor(closedAt, "VALIDATED", new Date("2026-10-21T10:00:00Z"))).toBe("VALIDATED");
  });

  it("calcula tiempo restante y qué estados puede validar el jefe", () => {
    expect(validationRemainingMs(closedAt, new Date("2026-10-19T20:00:00Z"))).toBe(12 * 3_600_000);
    expect(validationRemainingMs(closedAt, new Date("2026-10-21T08:00:00Z"))).toBe(0);
    expect(canValidate("PENDING_VERIFICATION")).toBe(true);
    expect(canValidate("PENDING_VERIFICATION_EXPIRED")).toBe(true);
    expect(canValidate("VALIDATED")).toBe(false);
    expect(canValidate(null)).toBe(false);
  });

  it("el escalado al Administrador incluye tarea, plan y fecha", () => {
    expect(escalationSummary({ taskId: "t-1", planName: "Extintores", closedAt })).toContain("Validación vencida");
    expect(escalationSummary({ taskId: "t-1", planName: "Extintores", closedAt })).toContain("Extintores");
  });
});
