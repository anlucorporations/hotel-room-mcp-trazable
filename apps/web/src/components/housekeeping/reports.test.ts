import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string): string => readFileSync(p, "utf8");

describe("informe de productividad de housekeeping (CU-V-26)", () => {
  it("existe la página, la API y el oráculo del informe", () => {
    for (const path of [
      "src/app/ama-de-llaves/informes/page.tsx",
      "src/app/api/housekeeping/reports/route.ts",
    ]) {
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
    }
    expect(read(`${ROOT}src/app/ama-de-llaves/informes/page.tsx`)).toContain('data-testid="productivity-report"');
    const api = read(`${ROOT}src/app/api/housekeeping/reports/route.ts`);
    expect(api).toContain("productivityReport");
    expect(api).toContain("HEAD_KEEPER");
  });

  it("el informe no expone datos de huéspedes", () => {
    const api = read(`${ROOT}src/app/api/housekeeping/reports/route.ts`);
    expect(api).not.toMatch(/guestName|guestEmail|contact/);
  });
});
