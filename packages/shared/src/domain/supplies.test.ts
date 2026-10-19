import { describe, expect, it } from "vitest";
import {
  SUPPLY_REMINDER_INTERVAL_HOURS,
  desiredAlertState,
  isBelowThreshold,
  isReminderDue,
  nextReminderAt,
  shouldCloseAlert,
  suggestedRestockQty,
} from "./supplies";

describe("suministros y alertas de stock (F8 · D-C33)", () => {
  it("abre alerta en o por debajo del umbral y no con umbral 0", () => {
    expect(isBelowThreshold({ stockQty: 5, thresholdQty: 10 })).toBe(true);
    expect(isBelowThreshold({ stockQty: 10, thresholdQty: 10 })).toBe(true);
    expect(isBelowThreshold({ stockQty: 11, thresholdQty: 10 })).toBe(false);
    expect(isBelowThreshold({ stockQty: 0, thresholdQty: 0 })).toBe(false);
    expect(desiredAlertState({ stockQty: 3, thresholdQty: 10 })).toBe("OPEN");
    expect(desiredAlertState({ stockQty: 30, thresholdQty: 10 })).toBe("CLOSED");
  });

  it("cierra la alerta al superar el umbral y sugiere reposición", () => {
    expect(shouldCloseAlert({ stockQty: 30, thresholdQty: 10 }, "OPEN")).toBe(true);
    expect(shouldCloseAlert({ stockQty: 10, thresholdQty: 10 }, "OPEN")).toBe(false);
    expect(suggestedRestockQty({ stockQty: 4, thresholdQty: 10 })).toBe(6);
    expect(suggestedRestockQty({ stockQty: 20, thresholdQty: 10 })).toBe(0);
  });

  it("el recordatorio es diario y persistente", () => {
    expect(SUPPLY_REMINDER_INTERVAL_HOURS).toBe(24);
    const now = new Date("2026-10-19T10:00:00Z");
    expect(isReminderDue({ status: "OPEN", lastRemindedAt: null }, now)).toBe(true);
    expect(isReminderDue({ status: "OPEN", lastRemindedAt: new Date("2026-10-19T09:00:00Z") }, now)).toBe(false);
    expect(isReminderDue({ status: "OPEN", lastRemindedAt: new Date("2026-10-18T09:00:00Z") }, now)).toBe(true);
    expect(isReminderDue({ status: "CLOSED", lastRemindedAt: null }, now)).toBe(false);
    expect(nextReminderAt(new Date("2026-10-18T10:00:00Z"))?.toISOString()).toBe("2026-10-19T10:00:00.000Z");
    expect(nextReminderAt(null)).toBeNull();
  });
});
