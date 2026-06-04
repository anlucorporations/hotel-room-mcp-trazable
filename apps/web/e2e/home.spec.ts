import { expect, test } from "@playwright/test";

test("la home renderiza la cabecera y un estado del catálogo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hotel Marina del Sol");

  // Sin RPC (entorno E2E) el catálogo cae a estado degradado; con datos mostraría tarjetas
  // o empty-state. Cualquiera de esos estados confirma que la UI del catálogo renderiza.
  const catalogState = page.locator(
    '[data-testid="degraded-state"], [data-testid="empty-state"], [data-testid^="night-"]',
  );
  await expect(catalogState.first()).toBeVisible();
});

test("el endpoint /api/health responde ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "web" });
});

test("el back-office de minteo pide conectar la wallet", async ({ page }) => {
  await page.goto("/admin/mint");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Back-office");
  // Sin proveedor web3 inyectado, el back-office solicita conectar.
  await expect(page.getByRole("button")).toBeVisible();
});
