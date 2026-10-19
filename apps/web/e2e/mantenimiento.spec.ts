import { expect, test } from "@playwright/test";

/**
 * E2E de la **Suite de Mantenimiento vNext** (F4 · gate de salida).
 *
 * La suite completa (bloqueo/desbloqueo firmado con wallet, preventivo crítico, etc.) exige un
 * backend con PostgreSQL, Redis y una wallet inyectada: no es hermética. Lo que sí debe cumplirse
 * siempre —y es lo que aquí se fija en escritorio y móvil— es que **ninguna** de las rutas nuevas se
 * sirve sin sesión: el gate RSC devuelve el acceso del back-office, no el panel.
 *
 * Los `data-testid` de firma se cubren en la suite de Vitest (`maintenance-suite.test.ts`), que los
 * verifica estáticamente sin necesidad de wallet.
 */

const ROUTES = [
  "/mantenimiento",
  "/mantenimiento/incidencias",
  "/mantenimiento/incidencias/00000000-0000-4000-8000-000000000000",
  "/mantenimiento/preventivo",
  "/mantenimiento/areas-comunes",
  "/mantenimiento/informes",
  "/mantenimiento/tablero",
];

test.describe("Suite de Mantenimiento · puerta de sesión", () => {
  for (const route of ROUTES) {
    test(`sin sesión, ${route} sirve el acceso y no el panel`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: /Back-office · acceso/i })).toBeVisible();
      await expect(page.getByTestId("maintenance-dashboard")).toHaveCount(0);
      await expect(page.getByTestId("incident-list")).toHaveCount(0);
    });
  }
});
