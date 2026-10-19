import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Guardián de F8: cola de validación, SLA y alertas de suministros. */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("F8 · suministros y SLA", () => {
  it("existen página, componente y API de validación", () => {
    for (const path of [
      "src/app/mantenimiento/validaciones/page.tsx",
      "src/components/maintenance/ValidationBoard.tsx",
      "src/app/api/mantenimiento/validaciones/route.ts",
    ]) {
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
    }
    const board = read(`${ROOT}src/components/maintenance/ValidationBoard.tsx`);
    expect(board).toContain('data-testid="pending-verification"');
    expect(board).toContain('data-testid="sla-countdown"');
    expect(board).toContain('"use client"');
  });

  it("la API de validación exige jefe/owner y valida con el repositorio", () => {
    const route = read(`${ROOT}src/app/api/mantenimiento/validaciones/route.ts`);
    expect(route).toContain('"HEAD_MAINTENANCE"');
    expect(route).toContain("validateTask");
    expect(route).toContain("remainingMs");
  });

  it("suministros expone alertas abiertas y umbral configurable (D-C33)", () => {
    const supplies = read(`${ROOT}src/app/api/housekeeping/supplies/route.ts`);
    expect(supplies).toContain("openAlerts");
    const admin = read(`${ROOT}src/app/api/admin/housekeeping/supplies/route.ts`);
    expect(admin).toContain("setSupplyThreshold");
    expect(admin).toContain("syncForItem");
  });

  it("i18n de validación en ES/EN/RU", () => {
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${ROOT}messages/${locale}.json`)) as { validaciones: Record<string, unknown> };
      for (const key of ["title", "remaining", "expired", "validate"]) {
        expect(catalog.validaciones[key], `${locale}:validaciones.${key}`).toBeTypeOf("string");
      }
    }
  });
});
