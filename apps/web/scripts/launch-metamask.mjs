/* eslint-disable no-console */
/**
 * Lanza un Chromium HEADED con la extensión MetaMask cargada y abre la web del hotel.
 *
 * Herramienta de OPERADOR para `TC-ACC-002` (aceptación FASE 5): el operador importa/crea la
 * wallet en MetaMask, deja que el onboarding de la web añada la red Besu (flujo 4902) y firma
 * la compra a mano. El navegador queda abierto hasta que el operador lo cierre.
 *
 * Requisito: extensión MetaMask descomprimida en `MM_EXT` (def. /tmp/metamask/ext), p. ej.:
 *   curl -sL -o mm.zip https://github.com/MetaMask/metamask-extension/releases/download/v13.34.1/metamask-chrome-13.34.1.zip
 *   unzip -q mm.zip -d /tmp/metamask/ext
 *
 * Parametrizable por entorno: WEB_URL (def. http://127.0.0.1:3001), MM_EXT, MM_PROFILE.
 */
import { chromium } from "@playwright/test";

const EXT = process.env.MM_EXT ?? "/tmp/metamask/ext";
// Perfil persistente: la wallet importada sobrevive a relanzamientos del navegador.
const PROFILE = process.env.MM_PROFILE ?? "/tmp/metamask/profile";
const WEB_URL = process.env.WEB_URL ?? "http://127.0.0.1:3001";

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--start-maximized",
  ],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
console.log(`✓ Navegador abierto en ${WEB_URL} con MetaMask cargada.`);
console.log("  El proceso queda vivo hasta que cierres el navegador.");

await new Promise((resolve) => context.on("close", resolve));
console.log("Navegador cerrado. Fin.");
