import { expect, test } from "@playwright/test";

/**
 * FASE 3: histórico y dashboard leen del worker. Sin worker en el entorno E2E, ambas vistas
 * deben mostrar su estado degradado (CU-09 09b / CU-11 11b) sin romper.
 */
test("el histórico muestra estado degradado si el worker no responde", async ({ page }) => {
  await page.goto("/historico");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Histórico");
  await expect(page.getByTestId("degraded-state")).toBeVisible();
});

test("el dashboard muestra estado degradado si el worker no responde", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dashboard");
  await expect(page.getByTestId("degraded-state")).toBeVisible();
});
