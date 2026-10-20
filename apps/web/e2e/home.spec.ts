import { expect, test } from "@playwright/test";

test("la home renderiza la cabecera y el hero", async ({ page }) => {
  await page.goto("/");
  // El H1 es el mensaje de marca del rediseño «Brisa Marina» (v2, 2026-10-08): la home ya no
  // titula con el nombre del hotel (que vive en la cabecera), sino con la propuesta de valor.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mediterráneo");
  // La cabecera pública es común a escritorio y móvil (misma marca, distinta disposición).
  await expect(page.getByRole("link", { name: /Marina del Sol, inicio/i })).toBeVisible();
  // La home es una one-page con la reserva como llamada a la acción principal.
  await expect(page.getByRole("link", { name: /Reservar con wallet/i })).toBeVisible();
});

test("el endpoint /api/health responde ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "web" });
});

test("el back-office pide iniciar sesión (D-04)", async ({ page }) => {
  // `/admin/mint` desapareció con la reorganización del back-office (2026-10-08): la publicación y
  // el acuñado viven en `/admin/habitacion`. Lo que sigue siendo contrato es el gate: sin sesión no
  // se sirve el panel, solo el acceso.
  await page.goto("/admin/habitacion");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Back-office");
  await expect(page.getByTestId("admin-sign-in")).toBeVisible();
});
