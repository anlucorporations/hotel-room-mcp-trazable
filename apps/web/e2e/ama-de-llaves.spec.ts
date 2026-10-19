import { expect, test } from "@playwright/test";

/**
 * E2E de la **Suite Ama de llaves** (F6 · gate de salida).
 *
 * El flujo completo (turnos, asignaciones, inspección con/sin firma, rechazo) exige backend vivo y,
 * con el flag activo, una wallet inyectada: no es hermético. Lo que sí debe cumplirse siempre —y se
 * fija aquí en escritorio y móvil— es que ninguna ruta de la suite se sirve sin sesión.
 *
 * Los oráculos de firma y estado se verifican estáticamente en
 * `components/housekeeping/ama-de-llaves-suite.test.ts`.
 */

const ROUTES = [
  "/ama-de-llaves",
  "/ama-de-llaves/turnos",
  "/ama-de-llaves/asignaciones",
  "/ama-de-llaves/inspecciones",
  "/ama-de-llaves/danos",
  "/ama-de-llaves/suministros",
];

test.describe("Suite Ama de llaves · puerta de sesión", () => {
  for (const route of ROUTES) {
    test(`sin sesión, ${route} sirve el acceso y no el panel`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: /Back-office · acceso/i })).toBeVisible();
      await expect(page.getByTestId("room-state-board")).toHaveCount(0);
      await expect(page.getByTestId("inspection-panel")).toHaveCount(0);
    });
  }
});
