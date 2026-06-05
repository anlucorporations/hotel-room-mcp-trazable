import { expect, test } from "@playwright/test";

/**
 * FASE 3/4.5: el histórico (público) lee del worker → sin worker muestra estado degradado
 * (CU-09 09b). El dashboard pasa a ser del back-office (RF-10): sin sesión SIWE pide acceso
 * (CU-01); su estado degradado por worker caído solo aplica ya autenticado.
 */
test("el histórico muestra estado degradado si el worker no responde", async ({ page }) => {
  await page.goto("/historico");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Histórico");
  await expect(page.getByTestId("degraded-state")).toBeVisible();
});

test("el dashboard del back-office exige iniciar sesión (RF-10/CU-01)", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Back-office");
  // Sin sesión no se muestran métricas: se solicita conectar/firmar (mismo gate que el mint).
  await expect(page.getByRole("button")).toBeVisible();
  await expect(page.getByTestId("degraded-state")).toHaveCount(0);
});
