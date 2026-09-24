import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad (RNF-20, TC-NF-030): 0 violaciones critical/serious en las vistas públicas.
 * Sin RPC/worker en el entorno E2E, las vistas muestran su estado degradado (también debe
 * ser accesible).
 *
 * `/reventa` (M4, D-07) entra en la lista al ser una vista pública nueva: su estado degradado
 * —RPC apagado— es el que se comprueba aquí. En M9 se añaden `/mis-noches` (donde vive el
 * resguardo) y `/checkin` (la pantalla que se enseña en recepción): la segunda se escanea en su
 * estado «sin resguardo», que es el que ve un visitante que llega sin haber generado el pase.
 */
const PATHS = [
  "/",
  "/reventa",
  "/historico",
  "/mis-noches",
  "/checkin",
  "/admin/dashboard",
  "/admin/mint",
  "/asistente",
] as const;

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
