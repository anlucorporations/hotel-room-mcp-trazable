import { expect, test } from "@playwright/test";

test("la home renderiza el nombre del hotel y el aviso de catálogo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Hotel Marina del Sol",
  );
  await expect(page.getByText(/catálogo de noches estará disponible/i)).toBeVisible();
});

test("el endpoint /api/health responde ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "web" });
});
