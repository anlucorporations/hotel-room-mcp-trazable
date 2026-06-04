import { describe, expect, it } from "vitest";
import { ROOM_COUNT } from "../domain/room-master";
import { buildSeedPlan, generateNightFixtures } from "./index";

const startDate = { year: 2026, month: 6, day: 1 } as const;

describe("fixtures / seed", () => {
  it("genera el catálogo 50×90 (= 4500 noches)", () => {
    const nights = generateNightFixtures({ startDate, days: 90 });
    expect(nights).toHaveLength(ROOM_COUNT * 90);
    expect(ROOM_COUNT).toBe(50);
  });

  it("es determinista (misma entrada → misma salida)", () => {
    const a = generateNightFixtures({ startDate, days: 30 });
    const b = generateNightFixtures({ startDate, days: 30 });
    expect(a).toEqual(b);
  });

  it("asigna tokenId único a cada noche", () => {
    const nights = generateNightFixtures({ startDate, days: 90 });
    const ids = new Set(nights.map((n) => n.tokenId.toString()));
    expect(ids.size).toBe(nights.length);
  });

  it("avanza correctamente sobre el fin de mes", () => {
    const nights = generateNightFixtures({ startDate: { year: 2026, month: 1, day: 30 }, days: 3 });
    const dates = [...new Set(nights.map((n) => n.dateYYYYMMDD))].sort((x, y) => x - y);
    expect(dates).toEqual([20260130, 20260131, 20260201]);
  });

  it("construye un plan con vendidos ⊆ noches y listados ⊆ vendidos", () => {
    const plan = buildSeedPlan({ startDate, days: 90 });
    const allIds = new Set(plan.nights.map((n) => n.tokenId.toString()));
    const soldIds = new Set(plan.soldTokenIds.map((id) => id.toString()));
    expect(plan.soldTokenIds.every((id) => allIds.has(id.toString()))).toBe(true);
    expect(plan.listedTokenIds.every((id) => soldIds.has(id.toString()))).toBe(true);
    expect(plan.soldTokenIds.length).toBeGreaterThan(0);
  });
});
