import { expect, test, type Page } from "@playwright/test";

/**
 * Asistente IA global (incremento v4): icono flotante en PC, avatar en la cabecera en móvil y
 * consultas que **se ven en la página**.
 *
 * La suite corre en dos proyectos (`chromium` y `mobile`), así que el disparador depende del
 * viewport: se elige con `test.info().project.name`. El backend del asistente no existe en E2E
 * (`/api/assistant` → 503), así que la navegación se prueba interceptando la respuesta: es
 * exactamente el contrato `pageAction` que el servidor devuelve cuando el turno consultó el catálogo.
 */

const isMobile = (): boolean => test.info().project.name === "mobile";

/** Abre el panel desde el disparador que corresponde al viewport. */
async function openAssistant(page: Page): Promise<void> {
  await page.getByTestId(isMobile() ? "assistant-header-trigger" : "assistant-launcher").click();
  await expect(page.getByTestId("assistant-panel")).toBeVisible();
}

test("el asistente está disponible en toda la plataforma con el disparador de su viewport", async ({
  page,
}) => {
  await page.goto("/");

  if (isMobile()) {
    // Móvil: el avatar vive en la cabecera y el icono flotante de escritorio no se muestra.
    await expect(page.getByTestId("assistant-header-trigger")).toBeVisible();
    await expect(page.getByTestId("assistant-launcher")).toBeHidden();
  } else {
    // PC: icono flotante abajo a la derecha, fijo (sigue visible al hacer scroll).
    await expect(page.getByTestId("assistant-launcher")).toBeVisible();
    await expect(page.getByTestId("assistant-header-trigger")).toBeHidden();
    await page.mouse.wheel(0, 1200);
    await expect(page.getByTestId("assistant-launcher")).toBeVisible();
  }

  // El disparador se etiqueta para lectores de pantalla y anuncia su estado.
  await expect(
    page.getByTestId(isMobile() ? "assistant-header-trigger" : "assistant-launcher"),
  ).toHaveAttribute("aria-expanded", "false");
});

test("el icono despliega la conversación y el panel se cierra con Escape", async ({ page }) => {
  await page.goto("/");
  await openAssistant(page);

  // La conversación es la misma del asistente: intro + caja de texto + envío.
  await expect(page.getByTestId("assistant-input")).toBeVisible();
  await expect(page.getByTestId("assistant-panel")).toContainText("Marina del Sol");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assistant-panel")).toBeHidden();
});

test("la conversación sobrevive a la navegación (el asistente lleva a la página)", async ({ page }) => {
  // El backend (fuera del alcance de E2E) responde con la acción de página que abre el catálogo
  // filtrado: es lo que el servidor deriva de una consulta como «habitaciones sencillas».
  await page.route("**/api/assistant", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "He encontrado las noches de habitación simple: te las muestro en el catálogo.",
        domainToolCalls: 1,
        preparedPurchase: null,
        pageAction: {
          kind: "catalog",
          href: "/catalogo?tipo=simple",
          search: { type: "simple", from: "", to: "", room: "" },
        },
      }),
    });
  });

  await page.goto("/");
  await openAssistant(page);
  await page.getByTestId("assistant-input").fill("¿qué habitaciones sencillas hay?");

  // El compositor está disponible para pulsarlo (un usuario real lo toca o usa Enter).
  await expect(page.getByTestId("assistant-send")).toBeEnabled();

  // Se envía con Enter, que es el camino documentado del compositor (UX#16: Enter envía,
  // Mayús+Enter salta de línea). En el proyecto «mobile» de Playwright, enfocar el campo hace que
  // Chrome desplace el *viewport visual* (visualViewport.offsetTop ≠ 0) y el hit-test del clic
  // resuelve el destino en coordenadas del viewport visual: el clic del botón se atribuye al
  // historial. Con Enter se prueba el mismo `submit()` sin depender de esa peculiaridad de la
  // emulación. El botón sigue verificado arriba (visible + habilitado).
  await page.getByTestId("assistant-input").press("Enter");

  // La consulta se materializa en la página: el catálogo, ya filtrado por tipo simple.
  await expect(page).toHaveURL(/\/catalogo\?tipo=simple$/);
  await expect(page.getByTestId("catalog-assistant-notice")).toBeVisible();
  await expect(page.getByTestId("catalog-assistant-notice")).toContainText("Simple");

  // Y la conversación no se pierde: al reabrir el asistente sigue ahí.
  await openAssistant(page);
  await expect(page.getByTestId("msg-assistant")).toContainText("catálogo");
});

test("el catálogo aplica el filtro que llega en la URL", async ({ page }) => {
  await page.goto("/catalogo?tipo=suite&desde=2026-06-01&hasta=2026-06-30");

  const notice = page.getByTestId("catalog-assistant-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Suite");
  await expect(notice).toContainText("2026-06-01");

  // «Quitar filtros» vuelve al catálogo completo.
  await notice.getByRole("link").click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByTestId("catalog-assistant-notice")).toBeHidden();
});
