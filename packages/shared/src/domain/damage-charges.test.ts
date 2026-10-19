import { describe, expect, it } from "vitest";
import {
  DAMAGE_CLAIM_WINDOW_HOURS,
  acknowledgeStatus,
  anonymizedEvidence,
  canGuestClaim,
  claimStatus,
  defaultClaimDueDate,
  isLinkedToSoldNight,
  resolutionForDecision,
  shouldAnonymizeEvidence,
  shouldExpire,
} from "./damage-charges";

const now = new Date("2026-10-19T12:00:00Z");
const inTwoHours = new Date(now.getTime() + 2 * 3_600_000);
const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);

describe("notificación de cargos por daños (F7 · T7.1/T7.4)", () => {
  it("el plazo por defecto es 24 h desde la emisión (D-C14)", () => {
    expect(DAMAGE_CLAIM_WINDOW_HOURS).toBe(24);
    expect(defaultClaimDueDate(now).toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it("el huésped puede reclamar solo si está emitida y dentro de plazo", () => {
    expect(canGuestClaim("SENT", inTwoHours, now)).toBe(true);
    expect(canGuestClaim("PENDING", inTwoHours, now)).toBe(true);
    expect(canGuestClaim("SENT", twoHoursAgo, now)).toBe(false);
    expect(canGuestClaim("DISPUTED", inTwoHours, now)).toBe(false);
    expect(canGuestClaim("RESOLVED_ACCEPTED", inTwoHours, now)).toBe(false);
  });

  it("reclamar deja DISPUTED y quedar conforme deja ACKNOWLEDGED", () => {
    expect(claimStatus("SENT", inTwoHours, now)).toBe("DISPUTED");
    expect(acknowledgeStatus("SENT", inTwoHours, now)).toBe("ACKNOWLEDGED");
    expect(claimStatus("SENT", twoHoursAgo, now)).toBeNull();
    expect(acknowledgeStatus("SENT", twoHoursAgo, now)).toBeNull();
  });

  it("solo caducan las emitidas y no resueltas con plazo vencido", () => {
    expect(shouldExpire("SENT", twoHoursAgo, now)).toBe(true);
    expect(shouldExpire("PENDING", twoHoursAgo, now)).toBe(true);
    expect(shouldExpire("SENT", inTwoHours, now)).toBe(false);
    expect(shouldExpire("DISPUTED", twoHoursAgo, now)).toBe(false);
    expect(shouldExpire("ACKNOWLEDGED", twoHoursAgo, now)).toBe(false);
    expect(shouldExpire("RESOLVED_ACCEPTED", twoHoursAgo, now)).toBe(false);
  });
});

describe("resolución en recepción y vínculo con la noche (F7 · T7.2/T7.5)", () => {
  it("aceptar deja el cargo PENDING para el folio; rechazar lo cancela (D-C11)", () => {
    expect(resolutionForDecision(true)).toEqual({
      notificationStatus: "RESOLVED_ACCEPTED",
      chargeStatus: "PENDING",
    });
    expect(resolutionForDecision(false)).toEqual({
      notificationStatus: "RESOLVED_REJECTED",
      chargeStatus: "CANCELLED",
    });
  });

  it("un cargo sin token no está vinculado a una noche vendida (D-C4)", () => {
    expect(isLinkedToSoldNight("20120261116")).toBe(true);
    expect(isLinkedToSoldNight(null)).toBe(false);
    expect(isLinkedToSoldNight("  ")).toBe(false);
  });
});

describe("retención y anonimización de evidencias (F7 · T7.6)", () => {
  const old = new Date("2026-05-01T00:00:00Z");
  const recent = new Date("2026-10-18T00:00:00Z");

  it("solo anonimiza evidencias con algo que borrar y pasado el plazo de 90 días", () => {
    expect(shouldAnonymizeEvidence({ evidencePath: "evidencias/foto.jpg" }, old, now)).toBe(true);
    expect(shouldAnonymizeEvidence({ disputeNotes: "no fui yo" }, old, now)).toBe(true);
    expect(shouldAnonymizeEvidence({ evidencePath: "x.jpg" }, recent, now)).toBe(false);
    expect(shouldAnonymizeEvidence({}, old, now)).toBe(false);
  });

  it("la proyección conserva el cargo y borra ruta y notas", () => {
    expect(anonymizedEvidence()).toEqual({ evidencePath: null, disputeNotes: null });
  });
});
