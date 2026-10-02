#!/usr/bin/env node
/**
 * Instrumento de la **hoja de identidad visual «Brisa Marina»** (Fase 1/3 del skill `visual-ui-ux`).
 *
 * Por qué existe: la cultura del proyecto exige **instrumento y artefacto** para cada afirmación de
 * calidad (ADR-23). El manual de identidad describe la paleta; este guion la **pinta** con los
 * valores reales del preset y con las tipografías reales del build de `apps/web`, de modo que la
 * evidencia visual no pueda desincronizarse del código.
 *
 * Qué genera (en `RepoTecnico/evidencias/`):
 *   - `identidad-brisa-marina.html` — hoja imprimible/openable, con el CSS compilado por Tailwind
 *     desde el preset real y las fuentes `woff2` del build copiadas a `identidad-assets/`.
 *   - `identidad-brisa-marina.png`  — captura a 2x de la hoja (requiere Playwright + chromium).
 *
 * Uso:
 *   pnpm --filter @hotel/web build          # una vez: deja el CSS y las fuentes en .next/
 *   node scripts/design/brand-sheet.mjs     # hoja HTML + PNG
 *   node scripts/design/brand-sheet.mjs --no-png
 *
 * Nota de entorno: si chromium no arranca por bibliotecas del sistema, exportar
 * `LD_LIBRARY_PATH` con el directorio que las contenga (p. ej. el extraído por Playwright).
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB = join(ROOT, "apps", "web");
const OUT_DIR = join(ROOT, "RepoTecnico", "evidencias");
const ASSETS = join(OUT_DIR, "identidad-assets");
const TMP = join(WEB, ".brand-sheet.tmp");
const NO_PNG = process.argv.includes("--no-png");

const require = createRequire(import.meta.url);
const preset = require(join(ROOT, "packages/config/tailwind/preset.cjs"));
const COLORS = preset.theme.extend.colors;

// ── Matemática WCAG (misma que `scripts/design/contrast-audit.mjs` y `lib/a11y/contrast.ts`) ──
const srgb = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => { const c = h.replace("#", ""); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b); };
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const hsl = (h) => {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return `hsl(0 0% ${Math.round(l * 100)}%)`;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : mx === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return `hsl(${Math.round(hh)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
};
const n = (value) => value.toFixed(2).replace(".", ",");

// ── Muestras por ROL (el orden es el del manual §2.1) ─────────────────────────────────────────
const SWATCHES = [
  ["mist", "background", "Fondo de página (porcelana fría)", null, false],
  ["mist-2", "background-alt", "Bandas, filas alternas, estados suaves", null, false],
  ["shell", "surface", "Tarjetas, formularios, modales", null, false],
  ["ink", "text-primary", "Texto principal", "shell", false],
  ["ink-soft", "text-secondary", "Texto secundario y ayudas", "shell", false],
  ["azure", "interactive", "Acción primaria, enlaces y foco (texto shell)", "shell", true],
  ["azure-deep", "interactive-hover", "Hover y pulsado (texto shell)", "shell", true],
  ["navy", "surface-dark", "Hero, pie y sidebar AdminLTE (texto mist)", "mist", true],
  ["navy-soft", "surface-dark-alt", "Secundaria oscura y hover (texto pearl)", "pearl", true],
  ["pearl", "premium-dark", "Detalle premium SOLO sobre oscuro", "navy", true],
  ["coral", "accent-fill", "Relleno de atención (texto shell)", "shell", true],
  ["coral-text", "accent-text", "Acento como texto sobre claro", "shell", false],
  ["amber", "premium-light", "Detalle sobre claro, con ink encima", "ink", true],
  ["fern", "available", "Estado «disponible» (texto shell)", "shell", true],
  ["line-strong", "border-strong", "Frontera de controles (WCAG 1.4.11)", "mist", false],
  ["line", "border", "Filetes decorativos: nunca un control", "mist", false],
];

const STATES = [
  ["success", "success-bg", "#1F7A4D"],
  ["warning", "warning-bg", "#8A5F0C"],
  ["error", "error-bg", "#B3261E"],
  ["info", "info-bg", "#0F6380"],
];

const swatchCard = ([token, role, use, against, dark]) => {
  const hex = COLORS[token];
  const chip = token === "line"
    ? `<div class="h-16 rounded-brand-sm border-2 border-line bg-mist"></div>`
    : token === "line-strong"
      ? `<div class="h-16 rounded-brand-sm border-2 border-line-strong bg-mist"></div>`
      : dark
        ? `<div class="flex h-16 items-center justify-center rounded-brand-sm bg-${token} text-small font-semibold text-${against}">${role}</div>`
        : `<div class="h-16 rounded-brand-sm bg-${token}${token === "shell" ? " ring-1 ring-line" : ""}"></div>`;
  const measurement = against === null
    ? "—"
    : `**${n(ratio(COLORS[against] ?? "#FFFFFF", hex))}:1** con \`${against}\``;
  return `      <div class="rounded-brand bg-shell p-4 shadow-card">
        ${chip}
        <p class="mt-3 font-mono text-caption text-ink-soft">${role}</p>
        <p class="text-h4 font-semibold text-ink">${token}</p>
        <p class="font-mono text-caption text-ink-soft">${hex} · ${hsl(hex)}</p>
        <p class="mt-1 text-caption text-ink-soft">${use} · ${measurement.replace(/\*\*/g, "")}</p>
      </div>`;
};

const stateCard = ([token, bg, hex]) => `      <div class="rounded-brand bg-${bg} p-4">
        <p class="text-small font-semibold text-${token}">${token}</p>
        <p class="font-mono text-caption text-ink-soft">${hex} · ${n(ratio(hex, COLORS[bg]))}:1 sobre su banda</p>
      </div>`;

const APPROVED = [
  ["ink", "mist"], ["shell", "azure"], ["pearl", "navy"], ["line-strong", "mist"], ["fern", "mist"],
];
const PROHIBITED = [
  ["pearl", "shell"], ["amber", "shell"], ["line", "mist"],
];

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Brisa Marina — hoja de identidad</title>
<link rel="stylesheet" href="identidad-assets/hoja.css" />
<link rel="stylesheet" href="identidad-assets/fuentes.css" />
<style>
  :root { --font-playfair: "__Playfair_Display_a12522", "__Playfair_Display_Fallback_a12522";
          --font-manrope: "__Manrope_fe7774", "__Manrope_Fallback_fe7774"; }
</style>
</head>
<body class="bg-mist text-ink">
<main class="mx-auto max-w-6xl px-8 py-12">
  <header class="mb-10">
    <p class="text-overline font-semibold uppercase text-coral-text">Hotel Marina del Sol · sistema visual v2.0.0</p>
    <h1 class="mt-2 font-display text-display font-medium text-navy">Brisa Marina</h1>
    <p class="mt-3 max-w-prose text-body-lg text-ink-soft">
      Registro luminoso y aéreo: porcelana fría de lienzo, azur vívido para la acción, marino profundo
      para el hero, el pie y la suite de administración (AdminLTE), y coral para lo que pide atención.
    </p>
  </header>

  <section class="mb-12">
    <h2 class="font-display text-h2 text-navy">1 · Paleta por roles semánticos</h2>
    <div class="mt-5 grid grid-cols-4 gap-4">
${SWATCHES.map(swatchCard).join("\n")}
    </div>
    <div class="mt-5 grid grid-cols-4 gap-4">
${STATES.map(stateCard).join("\n")}
    </div>
  </section>

  <section class="mb-12">
    <h2 class="font-display text-h2 text-navy">2 · Tipografía (Playfair Display + Manrope)</h2>
    <div class="mt-5 rounded-brand bg-shell p-6 shadow-card">
      <p class="font-display text-display leading-none text-navy">Aa Nn 0123 · Noches de hotel</p>
      <p class="mt-4 font-display text-h2 text-navy">H2 · Suites frente al mar</p>
      <p class="mt-3 text-body-lg text-ink-soft">body-lg · Entradilla editorial para la landing y las páginas de habitación.</p>
      <p class="mt-2 text-body text-ink">body · Texto base de la interfaz a 17 px, interlineado 1,5 y medida de lectura de 66 caracteres como máximo.</p>
      <p class="mt-2 text-body-sm text-ink-soft">body-sm · Tablas densas del personal de recepción y housekeeping.</p>
      <p class="mt-2 text-small text-ink-soft">small · Ayudas y etiquetas de formulario.</p>
      <p class="mt-2 text-caption text-ink-soft">caption · Metadatos, pies de foto y notas.</p>
      <p class="mt-2 text-overline font-semibold uppercase text-coral-text">overline · eyebrow de sección</p>
      <p class="mt-3 text-body text-ink">Cirílico (locale RU, cubierto por la marca): <span class="font-display text-h3">Ночь у моря</span> · <span class="font-semibold">Бронирование номера</span></p>
      <p class="mt-2 font-mono text-code text-ink-soft">code · 0x5FbDB2315678afecb367f032d93F642f64180aa3</p>
    </div>
  </section>

  <section class="mb-12">
    <h2 class="font-display text-h2 text-navy">3 · Componentes (átomos y estados)</h2>
    <div class="mt-5 grid grid-cols-2 gap-6">
      <div class="rounded-brand bg-shell p-6 shadow-card">
        <p class="text-overline font-semibold uppercase text-ink-soft">Acciones</p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button class="min-h-touch rounded-pill bg-azure px-5 text-small font-semibold text-shell">Reservar</button>
          <button class="min-h-touch rounded-pill bg-azure-deep px-5 text-small font-semibold text-shell">Hover</button>
          <button class="min-h-touch rounded-pill bg-coral px-5 text-small font-semibold text-shell">Atención</button>
          <button class="min-h-touch rounded-pill border border-line-strong bg-shell px-5 text-small font-semibold text-ink">Ghost</button>
          <button class="min-h-touch rounded-pill bg-mist-2 px-5 text-small font-semibold text-ink-soft" aria-disabled="true">Disabled</button>
        </div>
        <p class="mt-6 text-overline font-semibold uppercase text-ink-soft">Insignias y estados de habitación</p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <span class="rounded-pill bg-amber px-3 py-1.5 text-micro font-bold text-ink">Suite</span>
          <span class="rounded-pill bg-coral px-3 py-1.5 text-micro font-bold text-shell">Reventa</span>
          <span class="rounded-pill border border-fern/40 bg-fern/10 px-3 py-1.5 text-micro font-semibold text-fern">Libre</span>
          <span class="rounded-pill border border-amber/50 bg-amber/10 px-3 py-1.5 text-micro font-semibold text-ink">Pendiente</span>
          <span class="rounded-pill border border-azure/40 bg-azure/10 px-3 py-1.5 text-micro font-semibold text-azure-deep">Reservada</span>
          <span class="rounded-pill border border-ink-soft/40 bg-ink-soft/10 px-3 py-1.5 text-micro font-semibold text-ink-soft">Bloqueada</span>
        </div>
        <p class="mt-6 text-overline font-semibold uppercase text-ink-soft">Campo de formulario (frontera 1.4.11)</p>
        <label class="mt-3 block text-small font-semibold text-ink" for="f">Correo del titular</label>
        <input id="f" class="mt-2 min-h-touch w-full rounded-brand-sm border border-line-strong bg-mist px-3 text-ink" value="huesped@marinadelsol.es" />
        <p class="mt-2 text-caption text-ink-soft">Frontera line-strong · ${n(ratio(COLORS["line-strong"], COLORS.mist))}:1 sobre el lienzo</p>
      </div>

      <div class="rounded-brand bg-shell p-6 shadow-card">
        <p class="text-overline font-semibold uppercase text-ink-soft">Superficies oscuras y AdminLTE</p>
        <div class="mt-3 overflow-hidden rounded-brand border border-line">
          <div class="flex items-center justify-between bg-navy px-4 py-3">
            <span class="font-display text-h4 text-shell">Administración</span>
            <span class="text-micro text-pearl">Ayuda</span>
          </div>
          <div class="flex">
            <ul class="w-56 flex-none bg-navy py-3 text-small">
              <li class="px-4 py-1 text-micro font-semibold uppercase tracking-wider text-pearl">Operación</li>
              <li class="mt-1 bg-shell px-4 py-2 font-semibold text-navy">Dashboard</li>
              <li class="px-4 py-2 text-mist">Minteo de noches</li>
              <li class="px-4 py-2 text-mist">Fondos</li>
              <li class="mt-3 border-t border-pearl/30 px-4 pt-3 text-micro text-pearl">Sesión · owner</li>
            </ul>
            <div class="flex-1 bg-mist-2 p-4">
              <p class="text-caption text-ink-soft">Inicio · Administración · Dashboard</p>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div class="rounded-brand-sm bg-shell p-3 shadow-card"><p class="text-caption text-ink-soft">Ocupación</p><p class="font-display text-h3 text-navy">82 %</p></div>
                <div class="rounded-brand-sm bg-shell p-3 shadow-card"><p class="text-caption text-ink-soft">Noches vendidas</p><p class="font-display text-h3 text-navy">1.284</p></div>
              </div>
            </div>
          </div>
        </div>
        <p class="mt-6 text-overline font-semibold uppercase text-ink-soft">Elevación</p>
        <div class="mt-3 flex gap-4">
          <div class="flex-1 rounded-brand bg-shell p-4 shadow-card"><p class="text-small text-ink">card</p></div>
          <div class="flex-1 rounded-brand bg-shell p-4 shadow-card-hover"><p class="text-small text-ink">card-hover</p></div>
          <div class="flex-1 rounded-brand bg-shell p-4 shadow-modal"><p class="text-small text-ink">modal</p></div>
        </div>
      </div>
    </div>
  </section>

  <section class="mb-12">
    <h2 class="font-display text-h2 text-navy">4 · Landing (página principal)</h2>
    <div class="mt-5 overflow-hidden rounded-brand shadow-card">
      <div class="relative isolate bg-navy">
        <div class="relative bg-navy/65 px-8 py-12 text-shell">
          <p class="text-micro font-bold uppercase tracking-[0.18em] text-pearl">Hotel Marina del Sol · Alicante</p>
          <h3 class="mt-3 max-w-[18ch] font-display text-h1 font-medium text-shell">Tus noches en el <em class="not-italic text-pearl">Mediterráneo</em>, sin intermediarios</h3>
          <p class="mt-4 max-w-prose text-body-lg text-mist">Reserva directa, noche a noche, con el histórico verificable en la cadena.</p>
          <div class="mt-7 flex flex-wrap gap-3">
            <span class="inline-flex min-h-touch items-center rounded-pill bg-coral px-5 text-small font-semibold text-shell">Reservar ahora</span>
            <span class="inline-flex min-h-touch items-center rounded-pill bg-shell px-5 text-small font-semibold text-azure-deep">Ver catálogo</span>
            <span class="inline-flex min-h-touch items-center rounded-pill border border-pearl px-5 text-small font-semibold text-shell">Contacto</span>
          </div>
        </div>
      </div>
      <div class="bg-mist-2 px-8 py-4">
        <div class="rounded-brand bg-shell p-4 shadow-card">
          <div class="grid grid-cols-4 gap-4">
            <div><p class="text-caption text-ink-soft">Entrada</p><p class="text-small font-semibold text-ink">12 oct 2026</p></div>
            <div><p class="text-caption text-ink-soft">Salida</p><p class="text-small font-semibold text-ink">15 oct 2026</p></div>
            <div><p class="text-caption text-ink-soft">Huéspedes</p><p class="text-small font-semibold text-ink">2 adultos</p></div>
            <div class="flex items-end"><span class="inline-flex min-h-touch w-full items-center justify-center rounded-brand-sm bg-azure px-4 text-small font-semibold text-shell">Buscar disponibilidad</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mb-4">
    <h2 class="font-display text-h2 text-navy">5 · Accesibilidad (WCAG 2.1 AA)</h2>
    <div class="mt-5 grid grid-cols-2 gap-6">
      <div class="rounded-brand bg-shell p-6 shadow-card">
        <p class="text-overline font-semibold uppercase text-success">Aprobados (muestra de los 50 medidos)</p>
        <ul class="mt-3 space-y-2 text-small text-ink">
${APPROVED.map(([fg, bg]) => `          <li><span class="font-mono">${fg}</span> sobre <span class="font-mono">${bg}</span> — <span class="font-semibold">${n(ratio(COLORS[fg], COLORS[bg]))}:1</span></li>`).join("\n")}
        </ul>
      </div>
      <div class="rounded-brand bg-shell p-6 shadow-card">
        <p class="text-overline font-semibold uppercase text-error">Prohibidos (medidos)</p>
        <ul class="mt-3 space-y-2 text-small text-ink">
${PROHIBITED.map(([fg, bg]) => `          <li><span class="font-mono">${fg}</span> sobre <span class="font-mono">${bg}</span> — <span class="font-semibold">${n(ratio(COLORS[fg], COLORS[bg]))}:1</span> ❌</li>`).join("\n")}
          <li>Velo <span class="font-mono">navy</span> al 35 % — <span class="font-semibold">2,10:1</span> ❌</li>
        </ul>
      </div>
    </div>
  </section>

  <footer class="mt-8 border-t border-line pt-5 text-caption text-ink-soft">
    Hoja generada con el preset real (<span class="font-mono">packages/config/tailwind/preset.cjs</span>) y las
    tipografías del build de <span class="font-mono">apps/web</span> mediante
    <span class="font-mono">node scripts/design/brand-sheet.mjs</span>. Verificación de contraste:
    <span class="font-mono">node scripts/design/contrast-audit.mjs</span>.
  </footer>
</main>
</body>
</html>
`;

// ── Escritura de artefactos ───────────────────────────────────────────────────────────────────

if (!existsSync(join(WEB, ".next", "static", "css"))) {
  console.error("Falta el build de apps/web. Ejecuta: pnpm --filter @hotel/web build");
  process.exit(1);
}

mkdirSync(ASSETS, { recursive: true });
mkdirSync(TMP, { recursive: true });
const htmlPath = join(OUT_DIR, "identidad-brisa-marina.html");
writeFileSync(htmlPath, html);

// CSS real: Tailwind compila solo las clases usadas en la hoja, con el preset compartido.
const sheetCss = join(TMP, "hoja.css");
const tailwind = join(WEB, "node_modules", ".bin", "tailwindcss");
execFileSync(tailwind, ["-c", "tailwind.config.ts", "-i", "src/app/globals.css", "-o", sheetCss, "--content", htmlPath], {
  cwd: WEB,
  stdio: "inherit",
});
cpSync(sheetCss, join(ASSETS, "hoja.css"));

// Fuentes reales del build (`next/font` ya las descargó): se copian y se reescriben las URLs.
const cssDir = join(WEB, ".next", "static", "css");
let fontFaces = "";
for (const file of readdirSync(cssDir)) {
  const css = readFileSync(join(cssDir, file), "utf8");
  for (const match of css.matchAll(/@font-face\{[^}]*\}/g)) {
    if (/Playfair_Display|Manrope/.test(match[0])) fontFaces += `${match[0]}\n`;
  }
}
fontFaces = fontFaces.replace(/url\(\/_next\//g, "url(");
writeFileSync(join(ASSETS, "fuentes.css"), fontFaces);
cpSync(join(WEB, ".next", "static", "media"), join(ASSETS, "static", "media"), { recursive: true });

console.log(`hoja HTML: ${htmlPath}`);

if (NO_PNG) {
  rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

// Captura (Playwright + chromium). Si el entorno no puede arrancar el navegador, se declara.
try {
  const { chromium } = require(join(WEB, "node_modules", "@playwright", "test"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const png = join(OUT_DIR, "identidad-brisa-marina.png");
  await page.screenshot({ path: png, fullPage: true });
  await browser.close();
  console.log(`captura PNG: ${png}`);
} catch (error) {
  console.warn("No se pudo generar el PNG (el HTML queda como artefacto):", error.message);
}

rmSync(TMP, { recursive: true, force: true });
