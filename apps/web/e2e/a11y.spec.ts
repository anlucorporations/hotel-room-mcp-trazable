import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad (RNF-20, TC-NF-030): 0 violaciones critical/serious en las vistas públicas.
 * Sin RPC/worker en el entorno E2E, las vistas muestran su estado degradado (también debe
 * ser accesible).
 */
const PATHS = ["/", "/historico", "/admin/dashboard", "/admin/mint"] as const;

for (const path of PATHS) {
  test(`a11y: ${path} sin violaciones critical/serious`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([]);
  });
}
