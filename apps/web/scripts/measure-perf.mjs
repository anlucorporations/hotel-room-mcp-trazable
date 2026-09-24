/* eslint-disable no-console */
/* Globals del navegador usados dentro de funciones inyectadas (addInitScript / evaluate),
   que se serializan y ejecutan en la página, no en Node: */
/* global window */
/**
 * Medición de rendimiento del catálogo del demo (Bloque F, RNF-02/11).
 *
 * On-demand contra la web local (NO forma parte de la suite hermética/CI). Con Playwright
 * carga el catálogo y mide:
 *   - LCP (Largest Contentful Paint) vía `PerformanceObserver('largest-contentful-paint')`.
 *   - Tiempo de renderizado: hasta que el grid (`catalog-grid`) o un estado del catálogo
 *     (`empty-state` / `degraded-state` / primera `night-card-…`) es visible.
 *
 * Compara con los objetivos de `@hotel/shared`:
 *   - RENDER_TARGET_MS = 1000  (P75 hasta que el catálogo es visible)
 *   - LCP_TARGET_MS    = 2500  (P75, 4G, catálogo 50×90)
 * Se documentan aquí como literales para no acoplar el script al build de `@hotel/shared`;
 * un comentario los referencia para detectar divergencias en revisión.
 *
 * Imprime las métricas + PASS/WARN (WARN si se supera el objetivo: es una medición local
 * indicativa, no un gate de CI; la medición canónica P75 se hace bajo perfil 4G/lab).
 *
 * Parametrizable por entorno:
 *   WEB_URL   (def. http://127.0.0.1:3000)
 *   PERF_PATH (def. "/", la home con el catálogo)
 *
 * Uso:
 *   node apps/web/scripts/measure-perf.mjs
 *   WEB_URL=http://127.0.0.1:3000 node apps/web/scripts/measure-perf.mjs
 */
import { chromium } from "@playwright/test";

const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const PERF_PATH = process.env.PERF_PATH ?? "/";

// Objetivos de @hotel/shared/constants.ts (espejados aquí; ver cabecera).
const RENDER_TARGET_MS = 1000;
const LCP_TARGET_MS = 2500;

/** Devuelve `PASS`/`WARN` según si la métrica respeta el objetivo. */
function verdict(value, target) {
  return value <= target ? "PASS" : "WARN";
}

/** Formatea milisegundos con un decimal. */
function ms(value) {
  return value === null ? "n/d" : `${value.toFixed(1)} ms`;
}

async function main() {
  const target = new URL(PERF_PATH, WEB_URL).toString();
  console.log("Medición de rendimiento (on-demand contra el demo)");
  console.log(`  URL = ${target}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Observa el LCP desde el primer instante: el script se evalúa antes de cargar la página.
  await page.addInitScript(() => {
    window.__lcp = 0;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Navegador sin soporte del tipo de entrada: __lcp se queda en 0 y se reporta n/d.
    }
  });

  try {
    const navStart = Date.now();
    await page.goto(target, { waitUntil: "domcontentloaded" });

    // Tiempo de render: hasta que el catálogo (grid o cualquier estado) es visible.
    const catalogState = page.locator(
      '[data-testid="catalog-grid"], [data-testid="empty-state"], [data-testid="degraded-state"], [data-testid^="night-card-"]',
    );
    await catalogState.first().waitFor({ state: "visible", timeout: 30_000 });
    const renderMs = Date.now() - navStart;

    // Da margen a que el observador registre el LCP definitivo y léelo del navegador.
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(500);
    const lcpRaw = await page.evaluate(() => window.__lcp ?? 0);
    const lcpMs = lcpRaw > 0 ? lcpRaw : null;

    const renderVerdict = verdict(renderMs, RENDER_TARGET_MS);
    const lcpVerdict = lcpMs === null ? "n/d" : verdict(lcpMs, LCP_TARGET_MS);

    console.log("Métricas:");
    console.log(
      `  Render (catálogo visible): ${ms(renderMs)}  (objetivo ≤ ${RENDER_TARGET_MS} ms) → ${renderVerdict}`,
    );
    console.log(
      `  LCP:                       ${ms(lcpMs)}  (objetivo ≤ ${LCP_TARGET_MS} ms) → ${lcpVerdict}`,
    );

    const allPass = renderVerdict === "PASS" && (lcpVerdict === "PASS" || lcpVerdict === "n/d");
    console.log(
      `\n${allPass ? "✅ PASS" : "⚠️  WARN"}: medición local indicativa (no es la P75 canónica de lab/4G).`,
    );
  } catch (error) {
    console.error(error);
    console.error("\n✗ No se pudo medir: ¿está la web en marcha en WEB_URL?");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

void main();
