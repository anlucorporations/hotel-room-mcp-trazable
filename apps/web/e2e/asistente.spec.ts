import { expect, test } from "@playwright/test";
import { buildPurchaseTxData } from "@hotel/shared";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const TOKEN = "12920260622";

/**
 * E2E del asistente IA (CU-08, docs/SRS.md §9). En el entorno E2E no hay `ANTHROPIC_API_KEY` ni MCP, así que
 * `/api/assistant` responde 503 y la UI debe mostrar el estado `assistant-unavailable` con
 * acceso a la navegación manual (TC-E2E-031). El flujo completo de preparación+firma (TC-E2E-030)
 * se cubre con los tests deterministas del orquestador y la re-verificación cliente (`reverify`).
 */
test("el asistente registra el mensaje y muestra 'no disponible' sin backend (TC-E2E-031)", async ({
  page,
}) => {
  await page.goto("/asistente");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Asistente");

  await page.getByTestId("assistant-input").fill("¿qué noches hay disponibles?");
  await page.getByTestId("assistant-send").click();

  await expect(page.getByTestId("msg-user")).toContainText("¿qué noches hay disponibles?");
  await expect(page.getByTestId("assistant-unavailable")).toBeVisible();
  await expect(page.getByTestId("assistant-unavailable").getByRole("link")).toBeVisible();
});

test("el handoff muestra la tx decodificada (to/value/tokenId) para firmar (TC-E2E-030)", async ({ page }) => {
  const tx = buildPurchaseTxData({
    tokenId: BigInt(TOKEN),
    priceWei: 100_000_000_000_000_000n,
    saleType: "PRIMARY",
    contractAddress: CONTRACT,
    chainId: 31337,
  });
  // Intercepta el backend: devuelve una compra preparada (sin LLM/MCP reales en E2E).
  await page.route("**/api/assistant", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "Listo, revisa y firma.", domainToolCalls: 2, preparedPurchase: { tokenId: TOKEN, tx } }),
    });
  });

  await page.goto("/asistente");
  await page.getByTestId("assistant-input").fill("Compra la 129 para el 22 de junio");
  await page.getByTestId("assistant-send").click();

  await expect(page.getByTestId("purchase-handoff")).toBeVisible();
  await expect(page.getByTestId("handoff-to")).toContainText(CONTRACT);
  await expect(page.getByTestId("handoff-tokenId")).toContainText(TOKEN);
  await expect(page.getByTestId("handoff-value")).toContainText("0.1");
});
