import { expect, test } from "@playwright/test";

/**
 * E2E de cargos por daños (F7/F10 · T10.5): puertas de sesión y portal público del huésped.
 * El flujo con datos (alta→reclamo→resolución→folio) se validó contra producción y queda en la
 * evidencia JSON; aquí se fija lo hermético: sin sesión no se sirve el panel y el portal público
 * responde con su estado honesto.
 */
test.describe("Daños · puertas y portal", () => {
  test("recepción/danos exige sesión", async ({ page }) => {
    await page.goto("/recepcion/danos");
    await expect(page.getByRole("heading", { name: /Back-office · acceso/i })).toBeVisible();
    await expect(page.getByTestId("damage-claims-panel")).toHaveCount(0);
  });

  test("portal público de cargos responde y no filtra paneles internos", async ({ page }) => {
    await page.goto("/mis-noches/cargos");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("guest-damage-charge")).toHaveCount(0);
  });
});
