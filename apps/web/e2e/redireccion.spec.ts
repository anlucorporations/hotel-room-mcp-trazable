import { expect, test } from "@playwright/test";

/**
 * D-C40 (F10 · T10.3): `/housekeeping` redirige **permanentemente** a `/ama-de-llaves` sin romper
 * enlaces ni marcadores. Se comprueba la redirección real del servidor y que el destino conserva su
 * puerta de sesión.
 */
test.describe("Redirección D-C40", () => {
  test("/housekeeping acaba en /ama-de-llaves", async ({ page }) => {
    const response = await page.goto("/housekeeping");
    expect(response?.status()).toBe(200);
    await page.waitForURL(/\/ama-de-llaves$/);
    await expect(page.getByRole("heading", { name: /Back-office · acceso/i })).toBeVisible();
  });

  test("/housekeeping devuelve redirección permanente (308)", async ({ request }) => {
    const response = await request.get("/housekeeping", { maxRedirects: 0 });
    expect([308, 301]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/ama-de-llaves");
  });
});
