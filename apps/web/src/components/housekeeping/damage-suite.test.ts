import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Guardián de cargos por daños (F7): rutas, oráculos, cliente sin barril de servidor e i18n. */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("Cargos por daños · estructura (F7)", () => {
  it("existen las piezas de la demo", () => {
    for (const path of [
      `${ROOT}src/components/housekeeping/DamageChargeForm.tsx`,
      `${ROOT}src/components/reception/DamageClaimsPanel.tsx`,
      `${ROOT}src/components/guest/GuestChargeView.tsx`,
      `${ROOT}src/app/ama-de-llaves/danos/page.tsx`,
      `${ROOT}src/app/recepcion/danos/page.tsx`,
      `${ROOT}src/app/mis-noches/cargos/page.tsx`,
      `${ROOT}src/app/mis-noches/cargos/[id]/page.tsx`,
      `${ROOT}src/app/api/housekeeping/damage-charges/route.ts`,
      `${ROOT}src/app/api/reception/damage-charges/route.ts`,
      `${ROOT}src/app/api/public/damage-charges/[id]/route.ts`,
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });

  it("los data-testid del plan están presentes y no hay firma on-chain en el flujo", () => {
    const form = read(`${ROOT}src/components/housekeeping/DamageChargeForm.tsx`);
    expect(form).toContain('data-testid="damage-charge-form"');
    expect(form).toContain('data-testid="evidence-missing"');
    expect(read(`${ROOT}src/components/reception/DamageClaimsPanel.tsx`)).toContain('data-testid="damage-claims-panel"');
    expect(read(`${ROOT}src/components/guest/GuestChargeView.tsx`)).toContain('data-testid="guest-damage-charge"');
    const api = read(`${ROOT}src/app/api/housekeeping/damage-charges/route.ts`);
    expect(api).toContain("signatureId: null");
    expect(api).toContain("DAMAGE_CHARGE_NOTICE");
  });

  it("los componentes son de cliente y no importan el barril de servidor", () => {
    for (const file of [
      "src/components/housekeeping/DamageChargeForm.tsx",
      "src/components/reception/DamageClaimsPanel.tsx",
      "src/components/guest/GuestChargeView.tsx",
    ]) {
      const source = read(`${ROOT}${file}`);
      expect(source).toContain('"use client"');
      expect(source).not.toMatch(/from "@hotel\/shared"/);
    }
  });

  it("las claves i18n de daños existen en ES/EN/RU", () => {
    for (const locale of ["es", "en", "ru"]) {
      const catalog = JSON.parse(read(`${ROOT}messages/${locale}.json`)) as {
        damages: Record<string, unknown>;
      };
      for (const key of ["pageTitle", "form.submit", "claims.accept", "guest.claim", "status.DISPUTED"]) {
        let cursor: unknown = catalog.damages;
        for (const part of key.split(".")) {
          cursor = typeof cursor === "object" && cursor !== null ? (cursor as Record<string, unknown>)[part] : undefined;
        }
        expect(cursor, `${locale} :: damages.${key}`).toBeTypeOf("string");
      }
    }
  });
});
