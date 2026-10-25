#!/usr/bin/env node
/**
 * Propuesta visual de la SUITE PÚBLICA — distribución editorial basada en la plantilla Wix
 * «WH Vacation Rent» (wh-1061), adaptada al producto real (Hotel Marina del Sol).
 *
 * Qué hace:
 *   1. Modela la distribución de la referencia (cabecera transparente, hero a sangre centrado,
 *      relato asimétrico, tarjetas 3× imagen, ventajas, citas, banda a sangre, CTA y pie editorial).
 *   2. La aplica a las páginas reales de la suite pública: Home, Catálogo y Ficha de habitación.
 *   3. La muestra con las TRES identidades disponibles (A Cal & Sal, B Posidonia y Brisa Marina
 *      vigente) mediante un selector de tema: la distribución no depende de la paleta pendiente.
 *   4. Mide el contraste WCAG 2.1 de los pares del layout para las tres identidades y falla si
 *      alguno no cumple (misma matemática que `apps/web/src/lib/a11y/contrast.ts`).
 *   5. Genera previsualización navegable + capturas reales con Chromium (Playwright).
 *
 * Uso:
 *   node scripts/design/public-suite-v3.mjs            # todo (HTML, tablas, capturas)
 *   node scripts/design/public-suite-v3.mjs --no-png   # solo HTML + tablas
 *
 * Entorno: si Chromium falla por bibliotecas, el script añade EXTRA_LIBS a LD_LIBRARY_PATH.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROPOSAL_A, PROPOSAL_B } from "./proposals-v3.data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "RepoTecnico", "propuesta_suite_publica");
const PREV = join(OUT, "previsualizaciones");
const CAPS = join(OUT, "capturas");
const REF = join(OUT, "referencia");
const NO_PNG = process.argv.includes("--no-png");
for (const dir of [OUT, PREV, CAPS, REF]) mkdirSync(dir, { recursive: true });

const requireFromRoot = createRequire(import.meta.url);
const PRESET = requireFromRoot(join(ROOT, "packages/config/tailwind/preset.cjs"));

// ─────────────────────────────────────────────────────────────────────────────
// Temas: la distribución es una; la identidad se conmuta.
// ─────────────────────────────────────────────────────────────────────────────
const themeFromProposal = (p, label) => ({
  id: p.id.toLowerCase(),
  label,
  palette: p.palette,
  fonts: { display: p.fonts.display.stack, sans: p.fonts.ui.stack },
  radii: { xs: p.radii["brand-xs"], sm: p.radii["brand-sm"], md: p.radii.brand, lg: p.radii["brand-lg"] },
  shadows: p.shadows,
  veil: { token: "navy", alpha: 0.7 },
  premiumText: p.id === "A" ? "shell" : "ink",
});

const THEMES = [
  themeFromProposal(PROPOSAL_A, "A · Cal & Sal (recomendada)"),
  themeFromProposal(PROPOSAL_B, "B · Posidonia"),
  {
    id: "brisa",
    label: "Brisa Marina (vigente)",
    palette: { ...PRESET.theme.extend.colors },
    fonts: {
      display: '"Playfair Display", Georgia, serif',
      sans: '"Manrope", system-ui, -apple-system, sans-serif',
    },
    radii: { xs: 6, sm: 10, md: 16, lg: 22 },
    shadows: PRESET.theme.extend.boxShadow,
    veil: { token: "navy", alpha: 0.65 },
    premiumText: "ink",
  },
];

const THEME_CSS = THEMES.map((t) => {
  const vars = Object.entries(t.palette)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  const veilRgb = t.palette[t.veil.token].replace("#", "").match(/.{2}/g).map((h) => parseInt(h, 16)).join(",");
  return `html[data-theme="${t.id}"]{
${vars}
  --font-display: ${t.fonts.display};
  --font-sans: ${t.fonts.sans};
  --r-xs: ${t.radii.xs}px;
  --r-sm: ${t.radii.sm}px;
  --r-md: ${t.radii.md}px;
  --r-lg: ${t.radii.lg}px;
  --shadow-card: ${t.shadows.card};
  --shadow-hover: ${t.shadows["card-hover"]};
  --shadow-modal: ${t.shadows.modal};
  --veil-rgb: ${veilRgb};
  --veil-alpha: ${t.veil.alpha};
  --premium-text: var(--${t.premiumText});
  --on-dark: var(--shell);
  --on-dark-soft: var(--shell);
}`;
}).join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// WCAG 2.1
// ─────────────────────────────────────────────────────────────────────────────
const rgb = (hex) => {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
};
const srgb = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const composite = (color, alpha, base) => {
  const c = rgb(color);
  const b = rgb(base);
  const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha));
  return `#${[mix(c[0], b[0]), mix(c[1], b[1]), mix(c[2], b[2])].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
const fmt = (n) => n.toFixed(2).replace(".", ",");

const LAYOUT_PAIRS = [
  ["ink", "mist", "Texto principal sobre lienzo de página"],
  ["ink", "shell", "Texto principal sobre tarjeta/superficie"],
  ["ink", "mist-2", "Texto principal sobre banda tintada"],
  ["ink-soft", "mist", "Texto secundario sobre lienzo"],
  ["ink-soft", "shell", "Texto secundario sobre tarjeta"],
  ["ink-soft", "mist-2", "Texto secundario sobre banda"],
  ["azure", "shell", "Acción/enlace sobre superficie"],
  ["azure", "mist", "Acción sobre lienzo"],
  ["shell", "azure", "Texto sobre CTA primaria"],
  ["shell", "azure-deep", "Texto sobre CTA en hover"],
  ["coral-text", "shell", "Atención como texto sobre superficie"],
  ["coral-text", "mist", "Atención como texto sobre lienzo"],
  ["shell", "coral", "Texto sobre etiqueta de atención"],
  ["shell", "fern", "Texto sobre etiqueta «disponible»"],
  ["ink", "line", "Texto sobre separador (chips)"],
  ["line-strong", "shell", "Frontera de control sobre superficie", 3],
  ["line-strong", "mist", "Frontera de control sobre lienzo", 3],
  ["line-strong", "mist-2", "Frontera de control sobre banda", 3],
  ["success", "success-bg", "Confirmación sobre su banda"],
  ["warning", "warning-bg", "Aviso sobre su banda"],
  ["error", "error-bg", "Error sobre su banda"],
  ["info", "info-bg", "Información sobre su banda"],
  ["mist", "navy", "Texto claro sobre registro oscuro"],
  ["pearl", "navy", "Detalle premium sobre oscuro"],
  ["shell", "navy-soft", "Texto sobre oscuro secundario"],
];

function auditTheme(t) {
  const rows = [];
  const failures = [];
  for (const [fg, bg, where, min = 4.5] of LAYOUT_PAIRS) {
    const value = ratio(t.palette[fg], t.palette[bg]);
    rows.push({ fg, bg, where, min, value, fgHex: t.palette[fg], bgHex: t.palette[bg] });
    if (value < min) failures.push({ ...rows[rows.length - 1] });
  }
  const veilHex = composite(t.palette[t.veil.token], t.veil.alpha, t.palette.shell);
  const veilValue = ratio(t.palette.shell, veilHex);
  rows.push({ fg: "shell", bg: "veil", where: "Titular/nav sobre velo del hero", min: 4.5, value: veilValue, fgHex: t.palette.shell, bgHex: veilHex });
  if (veilValue < 4.5) failures.push({ ...rows[rows.length - 1] });
  return { rows, failures, veilHex };
}

const AUDITS = Object.fromEntries(THEMES.map((t) => [t.id, auditTheme(t)]));
for (const t of THEMES) {
  if (AUDITS[t.id].failures.length > 0) {
    console.error(`❌ Tema ${t.id}: ${AUDITS[t.id].failures.length} pares por debajo del mínimo`);
    for (const f of AUDITS[t.id].failures) console.error(`   ${f.fg} sobre ${f.bg}: ${fmt(f.value)} < ${f.min}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS de la previsualización
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Onest:wght@400;500;600;700&family=Spectral:wght@500;600;700&family=Inter+Tight:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap');
${THEME_CSS}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--mist);color:var(--ink);font-family:var(--font-sans);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,blockquote{margin:0;font-family:var(--font-display);font-weight:600;color:var(--ink)}
p{margin:0}
a{color:var(--azure);text-decoration:none}
img{display:block;max-width:100%}
button{font:inherit;cursor:pointer}
::selection{background:var(--azure);color:var(--shell)}

/* ── Chrome de la previsualización (no forma parte de la propuesta) ───────── */
.preview-bar{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:#0b141b;color:#e8eef2;padding:10px 20px;border-bottom:1px solid #23323d}
.preview-bar .pv-brand{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:#9fb4c2}
.preview-bar .pv-brand b{color:#fff;letter-spacing:.06em}
.preview-bar .pv-note{font-size:11px;color:#9fb4c2}
.theme-switch{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.theme-switch span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9fb4c2;margin-right:4px}
.theme-switch button{border:1px solid #384b59;background:transparent;color:#d7e3ea;border-radius:999px;padding:6px 11px;font-size:11px;font-weight:600;letter-spacing:.02em}
.theme-switch button[aria-pressed="true"]{background:#fff;color:#0b141b;border-color:#fff}
.theme-switch button:hover{border-color:#8fa9ba}

.doc{max-width:1360px;margin:0 auto;padding:38px 28px 90px}
.eyebrow{font-family:var(--font-sans);font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--coral-text)}
.eyebrow--inverse{color:var(--on-dark-soft)}
.doc-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}
.doc-title{font-size:64px;line-height:.98;letter-spacing:-.025em;margin-top:10px;max-width:900px}
.doc-title em{font-style:italic;color:var(--coral-text)}
.doc-lede{max-width:78ch;margin-top:20px;font-size:18px;line-height:1.6;color:var(--ink-soft)}
.doc-chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:420px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;border:1px solid var(--line-strong);border-radius:999px;padding:6px 12px;background:var(--shell);color:var(--ink)}
.chip--ok{background:var(--success-bg);border-color:var(--success);color:var(--success)}
.chip--accent{background:var(--coral);border-color:var(--coral);color:var(--shell)}
.toc{position:sticky;top:41px;z-index:40;display:flex;gap:2px;flex-wrap:wrap;padding:11px 0;margin:26px 0 0;background:linear-gradient(var(--mist) 70%,transparent);border-bottom:1px solid var(--line)}
.toc a{font-size:12px;font-weight:600;color:var(--ink-soft);padding:6px 11px;border-radius:999px}
.toc a:hover{background:var(--mist-2);color:var(--ink)}
.block{margin-top:64px;scroll-margin-top:80px}
.block-head{display:flex;justify-content:space-between;align-items:flex-end;gap:26px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:13px}
.block-head h2{font-size:32px;line-height:1.1;letter-spacing:-.015em;margin-top:5px}
.block-head .note{max-width:46ch;font-size:13px;line-height:1.55;color:var(--ink-soft)}
.card{background:var(--shell);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-card)}

/* ── Marquee de referencia ────────────────────────────────────────────────── */
.ref-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;margin-top:22px;align-items:start}
.ref-shot{border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;background:var(--shell);box-shadow:var(--shadow-card)}
.ref-shot img{width:100%;height:auto;max-height:620px;object-fit:cover;object-position:top;display:block}
.ref-caption{font-size:11px;color:var(--ink-soft);padding:10px 14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.ref-caption a{font-weight:600}
.measure{display:grid;gap:0;border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;background:var(--shell);box-shadow:var(--shadow-card)}
.measure-row{display:grid;grid-template-columns:1.05fr .95fr;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:12px}
.measure-row:last-child{border-bottom:0}
.measure-row b{font-weight:600}
.measure-row span{color:var(--ink-soft)}
.adopt{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.adopt article{padding:14px 15px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--shell)}
.adopt h3{font-family:var(--font-sans);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--coral-text);font-weight:700}
.adopt p{font-size:11.5px;line-height:1.5;color:var(--ink-soft);margin-top:6px}

/* ── Frame / browser ──────────────────────────────────────────────────────── */
.frame{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--shell);box-shadow:var(--shadow-modal);margin-top:22px}
.browser{height:40px;background:var(--mist-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;padding:0 15px}
.browser i{width:10px;height:10px;border-radius:50%;background:var(--line-strong);opacity:.55}
.browser .url{margin:0 auto;background:var(--shell);border:1px solid var(--line);border-radius:999px;font-size:11px;padding:4px 18px;color:var(--ink-soft)}
.browser .note{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft)}
.site{background:var(--mist);font-size:16px;position:relative;overflow:hidden}
.wrap{max-width:1280px;margin:0 auto}

/* ── Header editorial ─────────────────────────────────────────────────────── */
.site-header{position:absolute;inset:0 0 auto;z-index:30;display:grid;isolation:isolate;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:22px 44px;color:var(--on-dark)}
.site-header::before{content:"";position:absolute;left:0;right:0;top:-24px;height:190px;z-index:-1;pointer-events:none;background:linear-gradient(180deg,rgba(var(--veil-rgb),.80),rgba(var(--veil-rgb),.64) 55%,rgba(var(--veil-rgb),0))}
.site-header--solid::before{display:none}
.site-header--solid{position:relative;inset:auto;background:var(--shell);color:var(--ink);border-bottom:1px solid var(--line);padding:15px 44px}
.logo{display:flex;align-items:center;gap:11px;color:inherit}
.site-header--solid .logo{color:var(--ink)}
.logo strong,.logo em{color:inherit}
.logo .mark{width:38px;height:38px;border-radius:50%;background:var(--azure);color:var(--shell);display:grid;place-items:center;font-family:var(--font-display);font-size:14px;font-weight:600;flex:none}
.logo strong{display:block;font-size:11.5px;letter-spacing:.22em;font-weight:700;line-height:1.1}
.logo em{display:block;font-style:normal;font-size:8.5px;letter-spacing:.16em;opacity:.7;margin-top:2px}
.site-nav{display:flex;gap:28px;font-size:12.5px;font-weight:500;letter-spacing:.02em}
.site-nav a{color:inherit;opacity:.9}
.site-nav a:hover{opacity:1}
.site-header--solid .site-nav a{color:var(--ink-soft)}
.site-header--solid .site-nav a:hover{color:var(--ink)}
.header-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;font-size:11px}
.header-actions .lang{letter-spacing:.12em;opacity:.85}
.header-actions .header-help{font-size:11px;letter-spacing:.06em;opacity:.9;color:inherit}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:999px;border:1px solid transparent;font-family:var(--font-sans);font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;transition:background .2s var(--ease,ease),color .2s,border-color .2s}
.btn--hero{background:var(--shell);color:var(--ink);border-color:var(--shell)}
.btn--hero:hover{background:var(--mist);border-color:var(--mist)}
.btn--hero-ghost{background:transparent;color:var(--on-dark);border-color:rgba(255,255,255,.55)}
.btn--primary{background:var(--azure);color:var(--shell);border-color:var(--azure)}
.btn--primary:hover{background:var(--azure-deep);border-color:var(--azure-deep)}
.btn--outline{background:transparent;color:var(--ink);border-color:var(--line-strong)}
.btn--outline:hover{background:var(--mist-2)}
.btn--sm{min-height:40px;padding:0 16px;font-size:11px}
.header-actions .btn{min-height:40px;padding:0 17px;font-size:11px}
.link-arrow{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-sans);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--azure);border-bottom:1px solid var(--line-strong);padding-bottom:3px}
.link-arrow--inverse{color:var(--on-dark);border-color:rgba(255,255,255,.4)}
.header-burger{display:none!important}

/* ── Hero a sangre ────────────────────────────────────────────────────────── */
.hero{position:relative;min-height:760px;height:80vh;max-height:860px;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;text-align:center}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(var(--veil-rgb),.30),rgba(var(--veil-rgb),calc(var(--veil-alpha) + .08)) 55%,rgba(var(--veil-rgb),calc(var(--veil-alpha) + .12)))}
.hero-copy{position:relative;z-index:2;max-width:960px;padding:0 24px;color:var(--on-dark)}
.hero-copy .eyebrow{color:var(--on-dark-soft)}
.hero h1{font-size:clamp(3.2rem,5.4vw,5.6rem);line-height:.98;letter-spacing:-.025em;color:var(--on-dark);margin-top:16px;text-wrap:balance}
.hero h1 em{font-style:italic}
.hero-sub{margin:20px auto 0;max-width:56ch;font-size:17px;line-height:1.65;color:var(--on-dark)}
.hero-cta{display:flex;gap:12px;justify-content:center;margin-top:30px;flex-wrap:wrap}
.hero-mark{position:absolute;z-index:2;left:44px;bottom:86px;display:flex;align-items:center;gap:9px;color:var(--on-dark-soft);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase}
.hero-mark .dot{width:5px;height:5px;border-radius:50%;background:var(--on-dark-soft)}
.hero-scroll{position:absolute;z-index:2;right:44px;bottom:86px;color:var(--on-dark-soft);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase}

/* ── Booking dock (aportación del producto) ───────────────────────────────── */
.booking-wrap{position:relative;z-index:5;padding:0 44px;margin-top:-48px}
.booking{max-width:1140px;margin:0 auto;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-card);padding:14px;display:grid;grid-template-columns:1fr 1fr .85fr auto;gap:10px;align-items:end}
.b-field{border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:9px 12px;background:var(--shell)}
.b-field label{display:block;font-size:9px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-soft)}
.b-field strong{display:block;font-size:14px;line-height:1.25;margin-top:2px;color:var(--ink)}
.b-field em{display:block;font-style:normal;font-size:10px;color:var(--ink-soft);margin-top:1px}
.booking .btn{min-height:58px}

.trust{display:flex;align-items:center;justify-content:center;gap:0;flex-wrap:wrap;padding:30px 44px 34px;color:var(--ink-soft);font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.trust span{padding:0 22px;border-right:1px solid var(--line)}
.trust span:last-child{border-right:0}

/* ── Secciones editoriales ────────────────────────────────────────────────── */
.section{padding:104px 64px}
.section--tight{padding:76px 64px}
.section--tint{background:var(--mist-2)}
.section--shell{background:var(--shell)}
.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;flex-wrap:wrap;margin-bottom:42px}
.section-head h2{font-size:clamp(2.1rem,3.4vw,3.4rem);line-height:1.02;letter-spacing:-.02em;margin-top:8px;max-width:22ch;text-wrap:balance}
.section-head .head-note{max-width:44ch;font-size:14px;line-height:1.6;color:var(--ink-soft)}
.about{display:grid;grid-template-columns:4fr 6fr;gap:80px;align-items:start}
.about h2{font-size:clamp(2.4rem,3.6vw,3.9rem);line-height:1.02;letter-spacing:-.02em;margin-top:8px}
.about .about-label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);margin-top:12px;font-weight:600}
.about-copy p{font-size:19px;line-height:1.7;color:var(--ink-soft);max-width:58ch}
.about-copy p + p{margin-top:14px}
.about-copy .link-arrow{margin-top:26px}
.about-copy .signature{font-family:var(--font-display);font-style:italic;font-size:22px;color:var(--ink);margin-top:24px}

/* Tarjetas 3× imagen (distribución «Why choose us») */
.image-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}
.room-card{display:flex;flex-direction:column;gap:14px;color:inherit}
.room-media{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--r-sm);background:var(--mist-2)}
.room-media img{width:100%;height:100%;object-fit:cover;transition:transform .6s cubic-bezier(.22,.68,.24,1)}
.room-card:hover .room-media img{transform:scale(1.035)}
.tag{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 10px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:var(--shell);color:var(--ink)}
.room-media .tag{position:absolute;left:12px;top:12px}
.tag--available{background:var(--fern);color:var(--shell)}
.tag--premium{background:var(--amber);color:var(--premium-text)}
.tag--resale{background:var(--coral);color:var(--shell)}
.tag--soft{background:var(--mist-2);color:var(--ink-soft)}
.room-info{display:flex;flex-direction:column;gap:6px}
.room-type{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral-text)}
.room-info h3{font-size:27px;line-height:1.1;letter-spacing:-.01em}
.room-meta{font-size:12px;color:var(--ink-soft);line-height:1.5}
.price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:6px;padding-top:10px;border-top:1px solid var(--line)}
.price{font-family:var(--font-display);font-size:25px;font-weight:600;line-height:1}
.price small{font-family:var(--font-sans);font-size:10px;font-weight:500;color:var(--ink-soft)}
.price-row .link-arrow{font-size:11px}

/* Ventajas 3 columnas (la segunda rejilla de la referencia, sin imágenes) */
.advantages{display:grid;grid-template-columns:repeat(3,1fr);gap:44px;border-top:1px solid var(--line);padding-top:36px}
.adv{display:flex;flex-direction:column;gap:10px}
.adv .num{font-family:var(--font-display);font-size:16px;color:var(--coral-text);letter-spacing:.08em}
.adv h3{font-size:24px;line-height:1.2}
.adv p{font-size:13.5px;line-height:1.65;color:var(--ink-soft);max-width:34ch}

/* Banda de reventa */
.resale{display:grid;grid-template-columns:5fr 7fr;gap:56px;align-items:center}
.resale h2{font-size:clamp(2rem,3vw,3rem);line-height:1.05;letter-spacing:-.02em;margin-top:8px}
.resale p{font-size:16px;line-height:1.65;color:var(--ink-soft);margin-top:14px;max-width:46ch}
.resale-list{display:flex;flex-direction:column;gap:10px}
.listing{display:flex;align-items:center;gap:14px;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 14px 10px 10px}
.listing img{width:74px;height:74px;object-fit:cover;border-radius:calc(var(--r-sm) - 2px);flex:none}
.listing .l-info{min-width:0}
.listing strong{display:block;font-size:13.5px;font-weight:600}
.listing span{display:block;font-size:11px;color:var(--ink-soft);margin-top:1px}
.listing .l-price{margin-left:auto;text-align:right;flex:none}
.listing .l-price b{display:block;font-family:var(--font-display);font-size:21px;font-weight:600;line-height:1}
.listing .l-price small{font-size:9px;color:var(--ink-soft)}
.resale .link-arrow{margin-top:22px}

/* Banda inmersiva a sangre (imagen grande de la referencia) */
.band{position:relative;min-height:560px;background-size:cover;background-position:center;display:flex;align-items:flex-end;padding:64px}
.band::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(var(--veil-rgb),calc(var(--veil-alpha) + .08)),rgba(var(--veil-rgb),.18))}
.band-copy{position:relative;z-index:2;max-width:560px;color:var(--on-dark)}
.band-copy h2{font-size:clamp(2.2rem,3.6vw,3.6rem);line-height:1.03;letter-spacing:-.02em;color:var(--on-dark);margin-top:10px}
.band-copy p{font-size:16px;line-height:1.7;color:var(--on-dark);margin-top:14px;max-width:46ch}
.band-copy .link-arrow{margin-top:22px}

/* Citas (testimonios de la referencia) */
.quotes{display:grid;grid-template-columns:repeat(3,1fr);gap:44px;border-top:1px solid var(--line);padding-top:36px}
.quote{display:flex;flex-direction:column;gap:12px}
.quote .stars{color:var(--coral-text);font-size:12px;letter-spacing:.18em}
.quote blockquote{font-size:21px;line-height:1.4;font-style:italic;color:var(--ink)}
.quote footer{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}

/* CTA final / contacto */
.final{display:grid;grid-template-columns:1.15fr .85fr;gap:64px;align-items:center}
.final h2{font-size:clamp(2.2rem,3.6vw,3.6rem);line-height:1.03;letter-spacing:-.02em;margin-top:8px}
.final p{font-size:16px;line-height:1.7;color:var(--ink-soft);margin-top:14px;max-width:50ch}
.contact-card{background:var(--shell);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-card);padding:24px}
.contact-card .eyebrow{font-size:10px}
.contact-card a.tel{display:block;font-family:var(--font-display);font-size:30px;font-weight:600;color:var(--ink);margin-top:8px;line-height:1}
.contact-card .mail{display:block;font-size:13px;color:var(--azure);margin-top:8px}
.contact-card .btn{margin-top:18px;width:100%}
.contact-card .note{font-size:10.5px;color:var(--ink-soft);margin-top:10px}

/* Footer editorial */
.footer{background:var(--shell);border-top:1px solid var(--line);padding:64px 64px 28px}
.footer-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:40px;align-items:start}
.footer .wordmark{font-family:var(--font-display);font-size:46px;line-height:1;letter-spacing:-.01em;color:var(--ink)}
.footer .footer-contact{font-size:12px;line-height:1.8;color:var(--ink-soft);margin-top:14px}
.footer .footer-contact a{color:var(--ink-soft)}
.footer h3{font-family:var(--font-sans);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:12px}
.footer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.footer li a{font-size:12px;color:var(--ink);opacity:.82}
.footer li a:hover{opacity:1}
.footer-bottom{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:46px;padding-top:18px;font-size:10.5px;color:var(--ink-soft)}
.footer-bottom .social{display:flex;gap:16px}
.footer-bottom a{color:var(--ink-soft)}

/* ── Catálogo ─────────────────────────────────────────────────────────────── */
.page-head{padding:66px 64px 28px;display:flex;justify-content:space-between;align-items:flex-end;gap:34px;flex-wrap:wrap}
.page-head h1{font-size:clamp(2.5rem,4vw,4rem);line-height:1.02;letter-spacing:-.02em;margin-top:8px;max-width:18ch}
.page-head p{max-width:44ch;font-size:14px;line-height:1.65;color:var(--ink-soft)}
.catalog-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 64px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--mist)}
.chips{display:flex;gap:7px;flex-wrap:wrap}
.chip-f{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line-strong);background:var(--shell);color:var(--ink-soft);font-size:11px;font-weight:600}
.chip-f[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--shell)}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mini-field{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--line-strong);background:var(--shell);font-size:11px;color:var(--ink)}
.catalog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;padding:34px 64px 12px}
.catalog-card .room-media{aspect-ratio:4/3}
.catalog-card .price-row{margin-top:2px}
.catalog-card.is-sold .room-media img{opacity:.4}
.catalog-card.is-sold .price{color:var(--ink-soft)}
.skeleton{border-radius:var(--r-sm);background:linear-gradient(100deg,var(--mist-2) 20%,var(--line) 40%,var(--mist-2) 60%);background-size:200% 100%;animation:skeleton 1.5s linear infinite;aspect-ratio:4/3;border:1px solid var(--line)}
.skeleton-lines{height:74px;border-radius:var(--r-sm);background:linear-gradient(100deg,var(--mist-2) 20%,var(--line) 40%,var(--mist-2) 60%);background-size:200% 100%;animation:skeleton 1.5s linear infinite;margin-top:14px}
@keyframes skeleton{to{background-position:-200% 0}}
.load-more{display:flex;justify-content:center;padding:26px 64px 64px}
.catalog-note{display:flex;gap:10px;align-items:center;padding:0 64px 34px;font-size:11px;color:var(--ink-soft)}
.catalog-note b{color:var(--ink)}

/* ── Ficha de habitación ──────────────────────────────────────────────────── */
.detail-gallery{display:grid;grid-template-columns:2fr 1fr;gap:14px;padding:26px 64px 0}
.detail-gallery .g-main{aspect-ratio:16/10;border-radius:var(--r-md);overflow:hidden;background:var(--mist-2)}
.detail-gallery .g-side{display:flex;flex-direction:column;gap:14px}
.detail-gallery .g-side div{flex:1;border-radius:var(--r-md);overflow:hidden;background:var(--mist-2)}
.detail-gallery img{width:100%;height:100%;object-fit:cover}
.detail-head{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;flex-wrap:wrap;padding:30px 64px 22px}
.detail-head h1{font-size:clamp(2.2rem,3.4vw,3.4rem);line-height:1.04;letter-spacing:-.02em;margin-top:8px}
.detail-meta{font-size:12px;color:var(--ink-soft);margin-top:8px}
.detail-body{display:grid;grid-template-columns:7fr 4fr;gap:56px;padding:8px 64px 90px;align-items:start}
.detail-copy h2{font-size:28px;line-height:1.15;margin-top:0}
.detail-copy p{font-size:16px;line-height:1.75;color:var(--ink-soft);margin-top:10px;max-width:62ch}
.detail-copy .block{margin-top:38px}
.detail-copy .block h3{font-size:20px;margin-bottom:12px}
.amenities{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-top:6px}
.amenities span{font-size:12.5px;color:var(--ink-soft);display:flex;gap:8px;align-items:center}
.amenities span::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--azure);flex:none}
.policies{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:7px}
.policies li{font-size:12.5px;color:var(--ink-soft);display:flex;gap:8px}
.policies b{color:var(--ink);font-weight:600;min-width:92px}
.reviews-summary{display:flex;align-items:center;gap:14px;margin-top:6px}
.reviews-summary .score{font-family:var(--font-display);font-size:42px;line-height:1}
.reviews-summary .r-meta{font-size:11px;color:var(--ink-soft)}
.booking-card{position:sticky;top:20px;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-card);padding:22px}
.booking-card .eyebrow{font-size:10px}
.booking-card .big-price{font-family:var(--font-display);font-size:40px;line-height:1;margin-top:8px}
.booking-card .big-price small{font-family:var(--font-sans);font-size:11px;color:var(--ink-soft)}
.booking-card .fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
.booking-card .btn{width:100%;margin-top:14px}
.booking-card .trust-note{font-size:10.5px;color:var(--ink-soft);margin-top:10px;line-height:1.5}
.booking-card .resale-link{display:block;font-size:11px;color:var(--azure);margin-top:10px;text-decoration:underline}

/* ── Phones ───────────────────────────────────────────────────────────────── */
.phones{display:flex;gap:30px;justify-content:center;align-items:flex-start;flex-wrap:wrap;margin-top:24px}
.phone{width:374px;height:754px;border-radius:48px;background:#0c1014;padding:9px;flex:none;box-shadow:0 32px 64px rgba(0,0,0,.24);position:relative}
.phone::after{content:"";position:absolute;top:16px;left:50%;transform:translateX(-50%);width:104px;height:26px;border-radius:999px;background:#0c1014;z-index:9}
.screen{position:relative;height:100%;border-radius:40px;overflow:hidden;background:var(--mist);display:flex;flex-direction:column}
.sbar{height:36px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:11px;font-weight:700;color:var(--ink);background:var(--mist)}
.sbar--inverse{color:var(--on-dark);background:transparent;position:absolute;top:0;left:0;right:0;z-index:6}
.sbar span:last-child{letter-spacing:2px;font-size:9px}
.m-header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 10px;background:var(--shell);border-bottom:1px solid var(--line);flex:none;z-index:7}
.m-header--over{position:absolute;top:36px;left:0;right:0;background:transparent;border:0;color:var(--on-dark);isolation:isolate}
.m-header--over::before{content:"";position:absolute;left:0;right:0;top:-40px;height:130px;z-index:-1;background:linear-gradient(180deg,rgba(var(--veil-rgb),.80),rgba(var(--veil-rgb),.55) 60%,rgba(var(--veil-rgb),0))}
.m-header .logo strong{font-size:10px}
.m-header .logo .mark{width:31px;height:31px;font-size:11px}
.m-iconbtn{width:36px;height:36px;border-radius:50%;border:1px solid currentColor;background:transparent;color:inherit;display:grid;place-items:center;font-size:14px;padding:0;opacity:.9}
.m-scroll{flex:1;overflow:hidden}
.m-hero{position:relative;height:480px;background-size:cover;background-position:center;display:flex;align-items:flex-end;padding:26px 18px 90px}
.m-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(var(--veil-rgb),.25),rgba(var(--veil-rgb),calc(var(--veil-alpha) + .12)))}
.m-hero-copy{position:relative;z-index:2;color:var(--on-dark);width:100%;text-align:center}
.m-hero-copy .eyebrow{color:var(--on-dark-soft);font-size:9px}
.m-hero h2{font-size:38px;line-height:.98;letter-spacing:-.02em;color:var(--on-dark);margin-top:10px}
.m-hero h2 em{font-style:italic}
.m-hero p{font-size:13px;line-height:1.55;color:var(--on-dark);margin-top:10px}
.m-hero .btn{margin-top:18px;min-height:42px;font-size:10.5px}
.m-booking{margin:-58px 14px 0;position:relative;z-index:5;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--shadow-card);padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:7px}
.m-booking .b-field{padding:7px 9px}
.m-booking .b-field strong{font-size:12px}
.m-booking .btn{grid-column:1/-1;min-height:42px;font-size:10.5px}
.m-trust{display:flex;flex-wrap:wrap;gap:6px;padding:14px 16px 2px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft);font-weight:700}
.m-trust span{border:1px solid var(--line);border-radius:999px;padding:4px 8px}
.m-rooms{padding:18px 16px 84px}
.m-rooms .m-sec-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}
.m-rooms h3{font-size:21px}
.m-room-card{display:flex;gap:11px;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px;margin-bottom:9px;align-items:center}
.m-room-card img{width:86px;height:76px;border-radius:calc(var(--r-sm) - 2px);object-fit:cover;flex:none}
.m-room-card .i{min-width:0;flex:1}
.m-room-card .type{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--coral-text);font-weight:700}
.m-room-card strong{display:block;font-size:13px;margin-top:2px}
.m-room-card span{display:block;font-size:10px;color:var(--ink-soft);margin-top:1px}
.m-room-card .p{font-family:var(--font-display);font-size:18px;white-space:nowrap;flex:none}
.m-action{position:absolute;bottom:0;left:0;right:0;z-index:8;display:flex;align-items:center;gap:12px;background:var(--shell);border-top:1px solid var(--line);padding:10px 14px 16px}
.m-action .info{flex:1;min-width:0}
.m-action .info b{display:block;font-family:var(--font-display);font-size:20px;line-height:1}
.m-action .info span{font-size:9.5px;color:var(--ink-soft)}
.m-action .btn{flex:none;min-height:44px;font-size:10.5px;padding:0 18px}
.m-tabbar{position:absolute;bottom:0;left:0;right:0;z-index:8;height:66px;background:var(--shell);border-top:1px solid var(--line);display:flex;justify-content:space-around;align-items:center;padding-bottom:8px}
.m-tabbar span{font-size:9px;font-weight:600;color:var(--ink-soft);display:flex;flex-direction:column;align-items:center;gap:3px}
.m-tabbar span i{font-style:normal;font-size:15px}
.m-tabbar .on{color:var(--azure)}
.m-page-title{padding:12px 16px 6px;background:var(--shell)}
.m-page-title .eyebrow{font-size:8.5px}
.m-page-title h2{font-size:26px;line-height:1.05;margin-top:5px}
.m-page-title p{font-size:10.5px;color:var(--ink-soft);margin-top:5px}
.m-chips{display:flex;gap:6px;overflow:hidden;padding:10px 16px 12px;background:var(--shell);border-bottom:1px solid var(--line)}
.m-chips span{flex:none;font-size:9.5px;font-weight:600;border:1px solid var(--line-strong);border-radius:999px;padding:5px 9px;color:var(--ink-soft)}
.m-chips span.on{background:var(--ink);color:var(--shell);border-color:var(--ink)}
.m-cards{padding:14px 16px 78px}
.m-cat-card{background:var(--shell);border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;margin-bottom:11px}
.m-cat-card .img{height:160px;background-size:cover;background-position:center;position:relative}
.m-cat-card .img .tag{position:absolute;left:10px;top:10px}
.m-cat-card .body{padding:10px 12px 12px}
.m-cat-card .body strong{display:block;font-size:14px}
.m-cat-card .body span{font-size:10px;color:var(--ink-soft)}
.m-cat-card .row{display:flex;justify-content:space-between;align-items:center;margin-top:7px;padding-top:7px;border-top:1px solid var(--line)}
.m-cat-card .row b{font-family:var(--font-display);font-size:19px}
.m-cat-card .row .btn{min-height:32px;font-size:9px;padding:0 11px}
.m-detail-img{height:300px;background-size:cover;background-position:center;position:relative}
.m-detail-body{padding:16px 16px 84px;background:var(--mist)}
.m-detail-body h2{font-size:27px;line-height:1.05;margin-top:6px}
.m-detail-body .price-line{display:flex;align-items:flex-end;gap:6px;margin-top:12px}
.m-detail-body .price-line b{font-family:var(--font-display);font-size:30px;line-height:1}
.m-detail-body .price-line span{font-size:10px;color:var(--ink-soft);padding-bottom:3px}
.m-detail-body p{font-size:12.5px;line-height:1.6;color:var(--ink-soft);margin-top:10px}
.m-detail-body .amen{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px}
.m-detail-body .amen span{font-size:10px;color:var(--ink-soft);border:1px solid var(--line);border-radius:var(--r-xs);padding:6px 8px;background:var(--shell)}

/* ── Sistema y contraste ──────────────────────────────────────────────────── */
.system{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:22px}
.sys-card{padding:18px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--shell);box-shadow:var(--shadow-card)}
.sys-card .k{font-family:var(--font-display);font-size:28px;line-height:1;color:var(--ink)}
.sys-card h3{font-family:var(--font-sans);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--coral-text);margin-top:10px;font-weight:700}
.sys-card p{font-size:11px;line-height:1.5;color:var(--ink-soft);margin-top:6px}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px}
.theme-card{padding:16px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--shell);box-shadow:var(--shadow-card)}
.theme-card .tname{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;font-weight:700}
.theme-card .tname span{font-size:10px;font-weight:500;color:var(--ink-soft)}
.theme-card .sw{display:flex;height:34px;border-radius:8px;overflow:hidden;margin-top:10px;border:1px solid var(--line)}
.theme-card .sw i{flex:1}
.theme-card p{font-size:10.5px;line-height:1.5;color:var(--ink-soft);margin-top:9px}
.contrast{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:22px;align-items:start}
.ctable{width:100%;border-collapse:collapse;font-size:11px}
.ctable th{text-align:left;font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft);padding:8px 10px;border-bottom:1px solid var(--line);background:var(--mist-2)}
.ctable td{padding:6px 10px;border-bottom:1px solid var(--line)}
.ctable tr:last-child td{border-bottom:0}
.pair{display:inline-flex;gap:4px;margin-right:4px}
.pair i{width:14px;height:14px;border-radius:4px;border:1px solid rgba(0,0,0,.14);display:inline-block}
.ok{color:var(--success);font-weight:700}
.ko{color:var(--error);font-weight:700}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
.sum{padding:14px 16px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--shell);box-shadow:var(--shadow-card)}
.sum b{display:block;font-family:var(--font-display);font-size:28px;line-height:1}
.sum span{display:block;font-size:10px;color:var(--ink-soft);margin-top:5px}

.foot{margin-top:60px;border-top:1px solid var(--line);padding-top:16px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:10.5px;color:var(--ink-soft)}
.foot code{background:var(--mist-2);padding:2px 6px;border-radius:5px;font-size:10px}
@media (max-width:760px){
  .doc{padding:24px 16px 60px}.doc-title{font-size:42px}.toc{top:0}
  .ref-grid,.final,.resale,.about,.detail-body,.detail-gallery,.page-head,.catalog-grid,.catalog-toolbar,.load-more,.catalog-note,.site-header,.section,.footer,.booking-wrap{padding-left:20px;padding-right:20px}
  .image-cards,.advantages,.quotes,.system,.themes,.summary,.adopt{grid-template-columns:1fr}
  .catalog-grid,.detail-gallery,.detail-body{grid-template-columns:1fr}
  .site-nav{display:none}.header-burger{display:grid}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Piezas reutilizables
// ─────────────────────────────────────────────────────────────────────────────
const IMG = "../../../docs/imagenes/";
const IMAGES = {
  hero: `${IMG}201-Suite-2026-09-28-1.jpg`,
  roomA: `${IMG}101-Simple-2026-09-28-1.jpg`,
  roomB: `${IMG}201-Suite-2026-09-28-1.jpg`,
  roomC: `${IMG}116-Doble-2026-09-28-1.jpg`,
  band: `${IMG}104-Suite-2026-10-05-1.jpg`,
  resaleA: `${IMG}205-Suite-2026-10-05-1.jpg`,
  resaleB: `${IMG}304-Suite-2026-10-05-1.jpg`,
  detail: `${IMG}101-Simple-2026-09-28-1.jpg`,
};

const logo = `<a class="logo" href="#"><span class="mark" aria-hidden="true">M·S</span><span><strong>MARINA DEL SOL</strong><em>ALICANTE · COSTA BLANCA</em></span></a>`;

function header(variant = "hero") {
  const solid = variant === "solid";
  return `<header class="site-header${solid ? " site-header--solid" : ""}">
    ${logo}
    <nav class="site-nav" aria-label="Navegación principal"><a>Inicio</a><a>Habitaciones</a><a>Catálogo</a><a>Subastas</a><a>El hotel ⌄</a><a>Descubre ⌄</a></nav>
    <div class="header-actions"><span class="lang">ES · EN · RU</span><a class="header-help">Ayuda</a><button class="btn ${solid ? "btn--outline" : "btn--hero-ghost"} btn--sm">Entrar</button><button class="btn ${solid ? "btn--primary" : "btn--hero"} btn--sm">Reservar</button><button class="m-iconbtn header-burger" aria-label="Menú">☰</button></div>
  </header>`;
}

function footer(compact = false) {
  return `<footer class="footer">
    <div class="footer-top">
      <div><p class="wordmark">Marina del Sol</p><p class="footer-contact">Hotel Marina del Sol<br>Paseo del Puerto 12 · 03001 Alicante<br><a href="#">+34 965 000 000</a> · <a href="#">reservas@marinadelsol.es</a></p></div>
      <div><h3>Explorar</h3><ul><li><a>Habitaciones</a></li><li><a>Experiencias</a></li><li><a>El hotel</a></li><li><a>Reventa</a></li><li><a>Subastas</a></li></ul></div>
      <div><h3>Tu estancia</h3><ul><li><a>Mis noches</a></li><li><a>Check-in</a></li><li><a>Asistente</a></li><li><a>Ayuda</a></li><li><a>Contacto</a></li></ul></div>
      <div><h3>Legal</h3><ul><li><a>Privacidad</a></li><li><a>Términos</a></li><li><a>Cookies</a></li><li><a>Accesibilidad</a></li><li><a>Empresa</a></li></ul></div>
    </div>
    <div class="footer-bottom"><span>© 2026 Hotel Marina del Sol · Alicante · ES · EN · RU</span><span class="social"><a>Instagram</a><a>Facebook</a><a>LinkedIn</a></span><span>Noches trazables en cadena · hecho con cuidado en la costa</span></div>
  </footer>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Home (distribución de la referencia adaptada)
// ─────────────────────────────────────────────────────────────────────────────
function renderHome() {
  return `<div class="frame">
  <div class="browser"><i></i><i></i><i></i><span class="url">hotelmarinadelsol.es</span><span class="note">propuesta · suite pública</span></div>
  <div class="site">
    ${header("hero")}
    <section class="hero" style="background-image:url('${IMAGES.hero}')">
      <div class="hero-copy">
        <p class="eyebrow">Hotel Marina del Sol · Alicante · Costa Blanca</p>
        <h1>Tu noche,<br><em>en primera línea de mar.</em></h1>
        <p class="hero-sub">50 habitaciones frente al Mediterráneo. Compra tu noche, revéndela si cambias de planes y preséntate con tu pase digital.</p>
        <div class="hero-cta"><button class="btn btn--hero">Explorar habitaciones</button><button class="btn btn--hero-ghost">Cómo funciona</button></div>
      </div>
      <span class="hero-mark"><span class="dot"></span> Desde 1998 · 50 habitaciones · 4 suites</span>
      <span class="hero-scroll">Desliza ↓</span>
    </section>
    <div class="booking-wrap">
      <div class="booking">
        <div class="b-field"><label>Entrada</label><strong>12 octubre</strong><em>Sábado</em></div>
        <div class="b-field"><label>Salida</label><strong>15 octubre</strong><em>Martes · 3 noches</em></div>
        <div class="b-field"><label>Huéspedes</label><strong>2 personas</strong><em>1 habitación</em></div>
        <button class="btn btn--primary">Buscar disponibilidad</button>
      </div>
    </div>
    <div class="trust"><span>Reserva directa</span><span>Sin comisiones</span><span>Pago verificado en cadena</span><span>Pase digital offline</span></div>

    <section class="section">
      <div class="wrap about">
        <div><p class="eyebrow">El hotel</p><h2>Una casa de cal y sal, frente al mar.</h2><p class="about-label">Nuestra historia</p></div>
        <div class="about-copy">
          <p>Marina del Sol es un hotel familiar de 50 habitaciones en el puerto de Alicante. Cuidamos la luz, el desayuno y el silencio; lo demás lo dejamos al mar.</p>
          <p>Desde 2026, cada noche vive en la cadena como una noche en propiedad: reservas directas, trazabilidad real y la libertad de revenderla si tus planes cambian. La tecnología no se ve; la hospitalidad sí.</p>
          <a class="link-arrow">Conocer el hotel →</a>
          <p class="signature">— La familia Marina</p>
        </div>
      </div>
    </section>

    <section class="section section--shell">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Habitaciones</p><h2>Elige tu vista al mar</h2></div><div class="head-note">Tres formas de dormir frente al Mediterráneo. Todas incluyen desayuno de mercado, wifi y acceso a la terraza.</div></div>
        <div class="image-cards">
          <article class="room-card"><a class="room-media"><img src="${IMAGES.roomA}" alt="Doble con terraza"><span class="tag tag--available">Disponible</span></a><div class="room-info"><p class="room-type">Doble</p><h3>Doble con terraza</h3><p class="room-meta">2 personas · 22 m² · balcón al patio</p><div class="price-row"><span class="price">92 €<small> /noche</small></span><a class="link-arrow">Reservar →</a></div></div></article>
          <article class="room-card"><a class="room-media"><img src="${IMAGES.roomB}" alt="Suite vista mar"><span class="tag tag--premium">Suite</span></a><div class="room-info"><p class="room-type">Suite</p><h3>Suite vista mar</h3><p class="room-meta">3 personas · 38 m² · salón y terraza</p><div class="price-row"><span class="price">148 €<small> /noche</small></span><a class="link-arrow">Reservar →</a></div></div></article>
          <article class="room-card"><a class="room-media"><img src="${IMAGES.roomC}" alt="Doble familiar"><span class="tag">Últimas 3</span></a><div class="room-info"><p class="room-type">Familiar</p><h3>Doble familiar</h3><p class="room-meta">4 personas · 30 m² · dos camas</p><div class="price-row"><span class="price">118 €<small> /noche</small></span><a class="link-arrow">Reservar →</a></div></div></article>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Por qué reservar aquí</p><h2>Menos intermediarios, más mar.</h2></div><div class="head-note">La misma claridad del hotel, aplicada a una noche que de verdad es tuya.</div></div>
        <div class="advantages">
          <article class="adv"><span class="num">01</span><h3>Reserva directa</h3><p>Sin comisiones de plataforma y con la tarifa del hotel, siempre visible. El importe se confirma antes de pagar.</p><a class="link-arrow">Ver tarifas →</a></article>
          <article class="adv"><span class="num">02</span><h3>Noche en propiedad</h3><p>Cada noche queda registrada en la cadena: sabes qué compras, a quién y cuándo. Si no puedes venir, revéndela.</p><a class="link-arrow">Cómo funciona →</a></article>
          <article class="adv"><span class="num">03</span><h3>Pase digital</h3><p>Check-in con QR, también sin conexión. Si algo no se puede comprobar, la interfaz lo dice y ofrece reintentar.</p><a class="link-arrow">Ver mi pase →</a></article>
        </div>
      </div>
    </section>

    <section class="section section--tight section--tint">
      <div class="wrap resale">
        <div><p class="eyebrow">Mercado de reventa</p><h2>Si cambian tus planes, la noche no se pierde.</h2><p>Las noches de otros huéspedes, verificadas y con el precio a la vista. Compra una reventa o publica la tuya en dos toques.</p><a class="link-arrow">Explorar reventa →</a></div>
        <div class="resale-list">
          <div class="listing"><img src="${IMAGES.resaleA}" alt="Suite 205"><div class="l-info"><strong>Suite vista mar · 205</strong><span>18 octubre · 1 noche · reventa verificada</span></div><div class="l-price"><b>120 €</b><small>antes 148 €</small></div></div>
          <div class="listing"><img src="${IMAGES.resaleB}" alt="Suite 304"><div class="l-info"><strong>Suite vista mar · 304</strong><span>25 octubre · 2 noches · reventa verificada</span></div><div class="l-price"><b>132 €</b><small>por noche</small></div></div>
        </div>
      </div>
    </section>

    <section class="band" style="background-image:url('${IMAGES.band}')">
      <div class="band-copy"><p class="eyebrow eyebrow--inverse">Experiencias</p><h2>La terraza, a las siete.</h2><p>Desayuno de mercado, sombra de cañizo y el agua a un paso. La experiencia empieza antes de la reserva y sigue después del check-out.</p><a class="link-arrow link-arrow--inverse">Descubrir experiencias →</a></div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head"><div><p class="eyebrow">Huéspedes verificados</p><h2>Lo que se llevan a casa</h2></div><div class="head-note">Reseñas de estancias reales, moderadas antes de publicarse. Sin filtros de nadie.</div></div>
        <div class="quotes">
          <article class="quote"><span class="stars" aria-label="5 de 5 estrellas">★★★★★</span><blockquote>“Reservamos directo y la noche quedó en nuestra cartera. Al día siguiente estábamos desayunando frente al mar.”</blockquote><footer>Marta &amp; Luis · Suite vista mar · octubre 2026</footer></article>
          <article class="quote"><span class="stars" aria-label="5 de 5 estrellas">★★★★★</span><blockquote>“Compramos una reventa y el check-in fue enseñar el QR. Lo demás, sencillamente funcionó.”</blockquote><footer>Emily Smith · Doble con terraza · septiembre 2026</footer></article>
          <article class="quote"><span class="stars" aria-label="5 de 5 estrellas">★★★★★</span><blockquote>“El hotel es una joya, pero lo que nos convenció fue la transparencia: sabíamos qué comprábamos y cuánto.”</blockquote><footer>Samir Patel · Suite vista mar · agosto 2026</footer></article>
        </div>
      </div>
    </section>

    <section class="section section--tint">
      <div class="wrap final">
        <div><p class="eyebrow">Reserva directa</p><h2>¿Nos vemos frente al mar?</h2><p>Elige tu noche, paga con seguridad y recibe tu pase al instante. Si tienes dudas, el equipo del hotel responde en menos de un día.</p></div>
        <div class="contact-card"><p class="eyebrow">Contacto</p><a class="tel" href="tel:+34965000000">+34 965 000 000</a><a class="mail" href="mailto:reservas@marinadelsol.es">reservas@marinadelsol.es</a><button class="btn btn--primary">Reservar una noche</button><p class="note">Atención en ES · EN · RU · de 9:00 a 21:00</p></div>
      </div>
    </section>
    ${footer()}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────
function renderCatalog() {
  const card = (img, type, name, meta, price, tag, opts = {}) => `<article class="room-card catalog-card${opts.sold ? " is-sold" : ""}">
    <a class="room-media"><img src="${img}" alt="${name}">${tag ? `<span class="tag ${opts.tagClass || ""}">${tag}</span>` : ""}</a>
    <div class="room-info"><p class="room-type">${type}</p><h3>${name}</h3><p class="room-meta">${meta}</p><div class="price-row"><span class="price">${price}<small> /noche</small></span>${opts.sold ? `<span class="tag tag--soft">Vendida</span>` : `<a class="link-arrow">Reservar →</a>`}</div></div>
  </article>`;
  return `<div class="frame">
  <div class="browser"><i></i><i></i><i></i><span class="url">hotelmarinadelsol.es/catalogo</span><span class="note">catálogo</span></div>
  <div class="site">
    ${header("solid")}
    <div class="page-head"><div><p class="eyebrow">Catálogo</p><h1>Noches disponibles en Marina del Sol</h1></div><p>50 habitaciones frente al Mediterráneo. Elige fechas y personas: mostramos solo lo que se puede comprobar contra la cadena.</p></div>
    <div class="catalog-toolbar">
      <div class="chips" role="group" aria-label="Filtrar por tipo"><span class="chip-f" aria-pressed="true">Todas</span><span class="chip-f" aria-pressed="false">Dobles</span><span class="chip-f" aria-pressed="false">Suites</span><span class="chip-f" aria-pressed="false">Familiares</span><span class="chip-f" aria-pressed="false">Reventa</span><span class="chip-f" aria-pressed="false">Accesibles</span></div>
      <div class="filters"><span class="mini-field">12 – 15 oct</span><span class="mini-field">2 huéspedes</span><span class="mini-field">Precio ↑</span></div>
    </div>
    <div class="catalog-grid">
      ${card(IMAGES.roomA, "Doble", "Doble con terraza", "2 personas · 22 m² · balcón al patio", "92 €", "Disponible", { tagClass: "tag--available" })}
      ${card(IMAGES.roomB, "Suite", "Suite vista mar", "3 personas · 38 m² · salón y terraza", "148 €", "Suite", { tagClass: "tag--premium" })}
      ${card(IMAGES.roomC, "Familiar", "Doble familiar", "4 personas · 30 m² · dos camas", "118 €", "Últimas 3")}
      ${card(IMAGES.roomB, "Suite", "Suite 205 · reventa", "3 personas · 38 m² · reventa verificada", "120 €", "Reventa", { tagClass: "tag--resale" })}
      ${card(IMAGES.roomA, "Doble", "Doble 101", "2 personas · 22 m² · disponible 18 oct", "92 €", "", { sold: true })}
      <div class="catalog-skeleton" aria-hidden="true"><div class="skeleton"></div><div class="skeleton-lines"></div></div>
    </div>
    <div class="catalog-note"><b>6 de 50 noches</b> · ventana de 90 días · los precios incluyen impuestos y desayuno</div>
    <div class="load-more"><button class="btn btn--outline">Ver más noches</button></div>
    ${footer(true)}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ficha de habitación
// ─────────────────────────────────────────────────────────────────────────────
function renderDetail() {
  return `<div class="frame">
  <div class="browser"><i></i><i></i><i></i><span class="url">hotelmarinadelsol.es/habitaciones/suite-vista-mar</span><span class="note">ficha</span></div>
  <div class="site">
    ${header("solid")}
    <div class="detail-gallery"><div class="g-main"><img src="${IMAGES.roomB}" alt="Suite vista mar · salón"></div><div class="g-side"><div><img src="${IMAGES.roomA}" alt="Suite vista mar · habitación"></div><div><img src="${IMAGES.roomC}" alt="Suite vista mar · terraza"></div></div></div>
    <div class="detail-head"><div><p class="eyebrow">Suite · vista mar</p><h1>Suite vista mar</h1><p class="detail-meta">3 personas · 38 m² · salón y terraza · 2 camas · balcón al Mediterráneo</p></div><span class="tag tag--premium">Suite</span></div>
    <div class="detail-body">
      <div class="detail-copy">
        <h2>Una habitación para mirar el mar sin prisa.</h2>
        <p>La suite abre el salón a la terraza y deja entrar la luz de poniente. Desayuno de mercado, ropa de cama de algodón y una butaca para no hacer nada. Si vienes a trabajar, la mesa mira al puerto; si vienes a descansar, el mar pone el resto.</p>
        <div class="block"><h3>La habitación</h3><div class="amenities"><span>Cama king 180 cm</span><span>Sofá cama para 1</span><span>Terraza privada 12 m²</span><span>Aire acondicionado</span><span>Wifi de fibra</span><span>Escritorio con vistas</span><span>Caja fuerte</span><span>Minibar local</span></div></div>
        <div class="block"><h3>Servicios incluidos</h3><div class="amenities"><span>Desayuno de mercado</span><span>Toallas de playa</span><span>Late check-out (según disponibilidad)</span><span>Conserjería 24 h</span></div></div>
        <div class="block"><h3>Antes de reservar</h3><ul class="policies"><li><b>Entrada</b> desde las 15:00</li><li><b>Salida</b> hasta las 12:00</li><li><b>Cancelación</b> gratuita hasta 48 h antes</li><li><b>Mascotas</b> bienvenidas (10 €/noche)</li><li><b>Pago</b> con tarjeta, wallet o transferencia</li></ul></div>
        <div class="block"><h3>Reseñas</h3><div class="reviews-summary"><span class="score">4,9</span><div class="r-meta">★★★★★ · 128 reseñas verificadas<br>“La terraza al atardecer no tiene precio.”</div></div></div>
      </div>
      <aside class="booking-card">
        <p class="eyebrow">Desde</p><p class="big-price">148 €<small> /noche</small></p>
        <div class="fields"><div class="b-field"><label>Entrada</label><strong>12 oct</strong></div><div class="b-field"><label>Salida</label><strong>15 oct</strong></div><div class="b-field"><label>Huéspedes</label><strong>2 adultos</strong></div><div class="b-field"><label>Noches</label><strong>3</strong></div></div>
        <button class="btn btn--primary">Reservar esta suite</button>
        <p class="trust-note">Pago verificado en cadena · pase digital offline · cancelación gratuita hasta 48 h antes.</p>
        <a class="resale-link">Reventa disponible desde 120 € →</a>
      </aside>
    </div>
    ${footer(true)}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phones
// ─────────────────────────────────────────────────────────────────────────────
function renderPhones() {
  return `<div class="phones">
  <div class="phone"><div class="screen">
    <div class="sbar sbar--inverse"><span>9:41</span><span>▪▪▪ ▮</span></div>
    <div class="m-header m-header--over">${logo}<div style="display:flex;gap:8px"><button class="m-iconbtn" aria-label="Menú">☰</button></div></div>
    <div class="m-scroll">
      <div class="m-hero" style="background-image:url('${IMAGES.hero}')"><div class="m-hero-copy"><p class="eyebrow">Alicante · Costa Blanca</p><h2>Tu noche,<br><em>frente al mar.</em></h2><p>50 habitaciones. Compra, revende y preséntate con tu pase.</p><button class="btn btn--hero">Explorar habitaciones</button></div></div>
      <div class="m-booking"><div class="b-field"><label>Entrada</label><strong>12 oct</strong></div><div class="b-field"><label>Salida</label><strong>15 oct</strong></div><button class="btn btn--primary">Ver disponibilidad</button></div>
      <div class="m-trust"><span>Reserva directa</span><span>Pago verificado</span><span>Pase offline</span></div>
      <div class="m-rooms"><div class="m-sec-head"><h3>Habitaciones</h3><a class="link-arrow" style="font-size:9px">Ver todas</a></div>
        <div class="m-room-card"><img src="${IMAGES.roomA}" alt=""><div class="i"><p class="type">Doble</p><strong>Doble con terraza</strong><span>2 personas · 22 m²</span></div><span class="p">92 €</span></div>
        <div class="m-room-card"><img src="${IMAGES.roomB}" alt=""><div class="i"><p class="type">Suite</p><strong>Suite vista mar</strong><span>3 personas · 38 m²</span></div><span class="p">148 €</span></div>
        <div class="m-room-card"><img src="${IMAGES.roomC}" alt=""><div class="i"><p class="type">Familiar</p><strong>Doble familiar</strong><span>4 personas · 30 m²</span></div><span class="p">118 €</span></div>
      </div>
    </div>
    <div class="m-action"><div class="info"><b>Desde 92 €</b><span>por noche · sin comisiones</span></div><button class="btn btn--primary">Reservar</button></div>
  </div></div>

  <div class="phone"><div class="screen">
    <div class="sbar"><span>9:41</span><span>▪▪▪ ▮</span></div>
    <div class="m-header">${logo}<button class="m-iconbtn" aria-label="Buscar">⌕</button></div>
    <div class="m-page-title"><p class="eyebrow">Catálogo</p><h2>Noches disponibles</h2><p>12 – 15 octubre · 2 huéspedes · 50 habitaciones</p></div>
    <div class="m-chips"><span class="on">Todas</span><span>Dobles</span><span>Suites</span><span>Reventa</span></div>
    <div class="m-cards">
      <div class="m-cat-card"><div class="img" style="background-image:url('${IMAGES.roomA}')"><span class="tag tag--available">Disponible</span></div><div class="body"><strong>Doble con terraza</strong><span>2 personas · 22 m²</span><div class="row"><b>92 €</b><button class="btn btn--outline" style="min-height:32px;font-size:9px;padding:0 11px">Reservar</button></div></div></div>
      <div class="m-cat-card"><div class="img" style="background-image:url('${IMAGES.roomB}')"><span class="tag tag--premium">Suite</span></div><div class="body"><strong>Suite vista mar</strong><span>3 personas · 38 m²</span><div class="row"><b>148 €</b><button class="btn btn--outline" style="min-height:32px;font-size:9px;padding:0 11px">Reservar</button></div></div></div>
    </div>
    <div class="m-tabbar"><span class="on"><i>⌂</i>Inicio</span><span><i>▤</i>Catálogo</span><span><i>◫</i>Mis noches</span><span><i>◌</i>Asistente</span></div>
  </div></div>

  <div class="phone"><div class="screen">
    <div class="sbar"><span>9:41</span><span>▪▪▪ ▮</span></div>
    <div class="m-header">${logo}<button class="m-iconbtn" aria-label="Compartir">↗</button></div>
    <div class="m-scroll"><div class="m-detail-img" style="background-image:url('${IMAGES.roomB}')"></div>
      <div class="m-detail-body"><p class="eyebrow">Suite · vista mar</p><h2>Suite vista mar</h2><div class="price-line"><b>148 €</b><span>/noche</span></div><p>38 m² · terraza privada · 3 personas · desayuno incluido. La luz de poniente entra por el salón y la terraza mira al puerto.</p>
        <div class="amen"><span>Cama king</span><span>Terraza 12 m²</span><span>Desayuno</span><span>Wifi fibra</span></div>
      </div>
    </div>
    <div class="m-action"><div class="info"><b>148 €</b><span>por noche · 3 noches</span></div><button class="btn btn--primary">Reservar</button></div>
  </div></div>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sistema + contraste
// ─────────────────────────────────────────────────────────────────────────────
function renderSystem() {
  const a = AUDITS.a;
  const approved = a.rows.slice(0, 12).map((r) => `<tr><td><span class="pair"><i style="background:${r.fgHex}"></i><i style="background:${r.bgHex}"></i></span></td><td>${r.where}</td><td class="ok">${fmt(r.value)}:1</td><td>${r.min < 4.5 ? "≥3:1" : r.value >= 7 ? "AAA" : "AA"}</td></tr>`).join("");
  const veil = a.rows[a.rows.length - 1];
  const themeCards = THEMES.map((t) => `<article class="theme-card"><p class="tname">${t.label.split(" (")[0]} <span>${t.id === "a" ? "recomendada" : t.id === "b" ? "alternativa" : "vigente"}</span></p><div class="sw">${["mist", "mist-2", "shell", "ink", "azure", "navy", "pearl", "coral", "fern"].map((k) => `<i style="background:${t.palette[k]}" title="${k}"></i>`).join("")}</div><p>${t.fonts.display.split(",")[0].replace(/[\"']/g, "")} + ${t.fonts.sans.split(",")[0].replace(/[\"']/g, "")} · velo ${Math.round(t.veil.alpha * 100)} % · ${AUDITS[t.id].rows.length} pares medidos, 0 fallos.</p></article>`).join("");
  return `<div class="system">
    <article class="sys-card"><p class="k">12</p><h3>Rejilla</h3><p>Columnas, contenido 1.280 px, gutter 32 px y márgenes laterales de 64 px en escritorio; 20 px en móvil.</p></article>
    <article class="sys-card"><p class="k">104</p><h3>Ritmo</h3><p>Espaciado vertical de sección 104 px (desktop) / 56 px (móvil). Sin líneas de separación salvo filetes finos.</p></article>
    <article class="sys-card"><p class="k">3</p><h3>Variantes de header</h3><p>Transparente sobre hero, sólido en páginas internas y compacto al hacer scroll. Logo izquierda, nav central, CTA derecha.</p></article>
    <article class="sys-card"><p class="k">3</p><h3>Identidad conmutable</h3><p>La distribución no depende de la paleta: A, B y Brisa comparten rejilla, ritmo, componentes y estados.</p></article>
  </div>
  <div class="themes">${themeCards}</div>
  <div class="summary"><div class="sum"><b>${a.rows.length}</b><span>pares del layout medidos con WCAG 2.1 (tema A)</span></div><div class="sum"><b>0</b><span>pares por debajo de su mínimo en las tres identidades</span></div><div class="sum"><b>${fmt(veil.value)}:1</b><span>titular y nav sobre el velo del hero</span></div></div>
  <div class="contrast">
    <div class="card" style="overflow:hidden"><table class="ctable"><thead><tr><th></th><th>Par texto / fondo</th><th>Ratio</th><th>Nivel</th></tr></thead><tbody>${approved}<tr><td><span class="pair"><i style="background:${veil.fgHex}"></i><i style="background:${veil.bgHex}"></i></span></td><td>${veil.where} (${veil.bgHex})</td><td class="ok">${fmt(veil.value)}:1</td><td>AA</td></tr></tbody></table></div>
    <div class="card" style="padding:16px 18px"><p class="eyebrow">Reglas del layout</p><ul style="margin:10px 0 0;padding-left:16px;font-size:11.5px;line-height:1.7;color:var(--ink-soft)"><li>El texto sobre fotografía va <b>siempre</b> sobre el velo medido (≥70 %).</li><li>Los CTAs del hero son claros (shell) y los funcionales, azur; nunca dos primarios compitiendo.</li><li>Frontera de los campos de reserva con <b>line-strong</b> (≥3:1), no con el filete decorativo.</li><li>Las etiquetas de estado llevan texto; el color no es el único canal.</li><li>Foco visible de doble anillo en todos los controles y teclado completo.</li></ul></div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documento
// ─────────────────────────────────────────────────────────────────────────────
function renderReference() {
  return `<div class="ref-grid">
    <div class="ref-shot"><img src="../referencia/wix-wh-1061-escritorio.png" alt="Captura de la plantilla Wix WH Vacation Rent"><div class="ref-caption"><span>Wix · «WH Vacation Rent» (wh-1061) · captura real 1440 px · 2026-10-23</span><a href="https://es.wix.com/website-template/view/html/wh-1061">Ver original</a></div></div>
    <div>
      <div class="measure">
        <div class="measure-row"><b>Header</b><span>152 px, transparente sobre hero · logo izq., nav centro, CTA píldora der.</span></div>
        <div class="measure-row"><b>Hero</b><span>816 px (≈82 vh) · foto a sangre, H1 90 px serif centrado, subtítulo 18 px</span></div>
        <div class="measure-row"><b>Relato</b><span>Split 5/7 (título izq. · texto der.) · 438 px · CTA outline</span></div>
        <div class="measure-row"><b>Ventajas</b><span>3 columnas con imagen 4:5 · 934 px · título arriba izq.</span></div>
        <div class="measure-row"><b>Citas</b><span>3 columnas de testimonios · 439 px</span></div>
        <div class="measure-row"><b>Contacto</b><span>Formulario con inputs de filete inferior · 773 px</span></div>
        <div class="measure-row"><b>Banda</b><span>Imagen a sangre 952 px, sin texto encima</span></div>
        <div class="measure-row"><b>Footer</b><span>Fondo #E9E8E7 · wordmark serif enorme · 3 columnas · 432 px</span></div>
        <div class="measure-row"><b>Tipografías</b><span>Cormorant Garamond (display) + Avenir (UI) — equivalentes libres: Cormorant + Manrope/Onest</span></div>
        <div class="measure-row"><b>Botones</b><span>Píldora 50 px, borde 1 px, texto 10 px ⚠️ demasiado pequeño</span></div>
      </div>
      <div class="adopt">
        <article><h3>Se adopta</h3><p>Cabecera transparente de 3 zonas, hero centrado a sangre, ritmo amplio, split 5/7, tarjetas 3× imagen, citas a 3 columnas, banda inmersiva, footer de wordmark grande.</p></article>
        <article><h3>Se adapta</h3><p>La caja de reserva flotante, la reventa y las ventajas web3; CTA de conversión claro; navegación con ayuda y wallet; tipografía y cuerpo ≥17 px.</p></article>
        <article><h3>Se corrige</h3><p>Texto de 10 px en botones, labels taupe de 18 px con 3,67:1, nav blanco sobre foto sin velo garantizado (3,28:1 de media) y ausencia de foco visible.</p></article>
      </div>
    </div>
  </div>`;
}

function renderDoc() {
  const toc = [["#referencia", "Referencia"], ["#home", "Home"], ["#movil", "Móvil"], ["#catalogo", "Catálogo"], ["#ficha", "Ficha"], ["#sistema", "Sistema de layout"], ["#contraste", "Contraste"]];
  return `<!doctype html>
<html lang="es" data-theme="a">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suite pública · distribución editorial — Hotel Marina del Sol</title>
<style>${CSS}</style>
</head>
<body>
<div class="preview-bar">
  <div class="pv-brand"><b>Propuesta · Suite pública</b><span>distribución editorial</span></div>
  <div class="pv-note">La distribución es una; la identidad se conmuta:</div>
  <div class="theme-switch" role="group" aria-label="Identidad de muestra">
    ${THEMES.map((t) => `<button data-theme-btn="${t.id}" aria-pressed="${t.id === "a"}">${t.label}</button>`).join("")}
  </div>
</div>
<div class="doc">
  <header class="doc-head">
    <div>
      <p class="eyebrow">@visualUiUx · suite pública · 2026-10-23</p>
      <h1 class="doc-title">Marina <em>Editorial</em></h1>
      <p class="doc-lede">La distribución de la referencia Wix «WH Vacation Rent» aplicada a la suite pública real: cabecera transparente de tres zonas, hero centrado a sangre, relato asimétrico, tarjetas de tres columnas, citas, banda inmersiva y footer de wordmark grande. El motor de reserva del producto —que la referencia no tiene— se integra como pieza propia bajo el hero. La misma estructura funciona con las tres identidades disponibles.</p>
    </div>
    <div class="doc-chips"><span class="chip chip--accent">Referencia Wix wh-1061</span><span class="chip chip--ok">✅ WCAG 2.1 AA medido</span><span class="chip">Web · Móvil · APK</span><span class="chip">3 identidades conmutables</span></div>
  </header>
  <nav class="toc" aria-label="Índice">${toc.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}</nav>

  <section class="block" id="referencia">
    <div class="block-head"><div><p class="eyebrow">01 · Referencia</p><h2>Qué distribución usamos</h2></div><p class="note">Medida sobre la plantilla renderizada (no sobre una captura de marketing): alturas reales de sección, jerarquía tipográfica y ritmo vertical. La referencia es un escaparate de alquiler vacacional; nosotros la usamos como <b>esqueleto editorial</b>, no como contenido.</p></div>
    ${renderReference()}
  </section>

  <section class="block" id="home">
    <div class="block-head"><div><p class="eyebrow">02 · Home</p><h2>Landing pública</h2></div><p class="note">Hero a sangre con velo ≥70 %, titular serif centrado, CTA claro y caja de reserva flotante. Después, el ritmo de la referencia: relato, habitaciones, ventajas, reventa, experiencia a sangre, citas y cierre. <b>Clientes ES · EN · RU.</b></p></div>
    ${renderHome()}
  </section>

  <section class="block" id="movil">
    <div class="block-head"><div><p class="eyebrow">03 · Móvil y APK</p><h2>La misma distribución en 390 px</h2></div><p class="note">Cabecera superpuesta, hero centrado más corto, reserva apilada, tarjetas a una columna y barra de acción fija en la zona del pulgar. Web móvil y APK comparten los mismos componentes y tokens.</p></div>
    ${renderPhones()}
  </section>

  <section class="block" id="catalogo">
    <div class="block-head"><div><p class="eyebrow">04 · Catálogo</p><h2>Plantilla de listado</h2></div><p class="note">Misma cabecera sólida y ritmo editorial. Filtros en píldoras, tarjetas 4:3, estado agotado y <i>skeleton</i> de carga visibles; la ventana de 90 días y el stock real mandan.</p></div>
    ${renderCatalog()}
  </section>

  <section class="block" id="ficha">
    <div class="block-head"><div><p class="eyebrow">05 · Ficha</p><h2>Plantilla de habitación</h2></div><p class="note">Galería editorial, relato, servicios, políticas y reseñas a la izquierda; tarjeta de reserva pegajosa a la derecha. En móvil, la reserva se convierte en barra inferior.</p></div>
    ${renderDetail()}
  </section>

  <section class="block" id="sistema">
    <div class="block-head"><div><p class="eyebrow">06 · Sistema</p><h2>Reglas de la distribución</h2></div><p class="note">Lo que se repite en todas las páginas: rejilla, ritmo, variantes de cabecera y una única acción primaria por vista. Las identidades conmutan valores de token, no estructura.</p></div>
    ${renderSystem()}
  </section>

  <section class="block" id="contraste">
    <div class="block-head"><div><p class="eyebrow">07 · Accesibilidad</p><h2>Contraste medido</h2></div><p class="note">Pares del layout medidos con la misma matemática WCAG 2.1 del producto. El generador falla si un par no llega a su mínimo en cualquiera de las tres identidades; la tabla completa está en <code>contraste-suite-publica.md</code>.</p></div>
    <div class="card" style="padding:16px 18px"><p style="font-size:12px;color:var(--ink-soft)">El contraste de la tabla superior corresponde al tema <b>A · Cal & Sal</b> (activo por defecto). Los tres temas se miden y se documentan; el detalle completo está en el markdown generado.</p></div>
  </section>

  <footer class="foot"><span><b>Marina Editorial</b> · suite pública · generado por <code>scripts/design/public-suite-v3.mjs</code></span><span>Referencia: Wix WH Vacation Rent (wh-1061) · captura real · Hotel Marina del Sol · 2026-10</span></footer>
</div>
<script>
  const buttons = [...document.querySelectorAll('[data-theme-btn]')];
  buttons.forEach((btn) => btn.addEventListener('click', () => {
    document.documentElement.dataset.theme = btn.dataset.themeBtn;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  }));
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de contraste markdown
// ─────────────────────────────────────────────────────────────────────────────
function writeContrastMd() {
  const sections = THEMES.map((t) => {
    const audit = AUDITS[t.id];
    const rows = audit.rows
      .map((r) => `| \`${r.fg}\` ${r.fgHex} | \`${r.bg}\` ${r.bgHex} | **${fmt(r.value)}:1** | ${r.min}:1 | ${r.value >= r.min ? (r.min < 4.5 ? "≥3:1 ✅" : r.value >= 7 ? "AAA ✅" : "AA ✅") : "NO CUMPLE ❌"} | ${r.where} |`)
      .join("\n");
    return `## ${t.label}

> Velo del hero: **${Math.round(t.veil.alpha * 100)} %** → compuesto \`${audit.veilHex}\`. Pares medidos: **${audit.rows.length}**, fallos: **${audit.failures.length}**.

| Texto | Fondo | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
${rows}`;
  }).join("\n\n");
  const md = `# Contraste WCAG 2.1 — Suite pública «Marina Editorial»

> Generado por \`scripts/design/public-suite-v3.mjs\` con la misma matemática que
> \`apps/web/src/lib/a11y/contrast.ts\` y \`scripts/design/contrast-audit.mjs\` (luminancia
> relativa + ratio sin redondear). **Fecha**: 2026-10-23.
> **Resultado global: 0 fallos.** Si un par incumple en cualquiera de las tres identidades,
> el generador **falla y no publica** la propuesta.

${sections}

## Notas de medición

- **Fronteras de control** (\`line-strong\`): mínimo **3:1** (WCAG 1.4.11), no 4,5:1.
- **Texto sobre fotografía**: se mide el compuesto del velo declarado sobre \`shell\`; el texto del
  hero es siempre \`shell\` (no un tono translúcido) para que el ratio no dependa de la foto.
- **Texto deshabilitado**: exento por WCAG 2.1 · 1.4.3.
- Los tres temas comparten **pares y umbrales**; solo cambian los valores de la identidad.
`;
  writeFileSync(join(OUT, "contraste-suite-publica.md"), md);
}

// ─────────────────────────────────────────────────────────────────────────────
// Capturas
// ─────────────────────────────────────────────────────────────────────────────
const EXTRA_LIBS = ["/home/dsh/tools/libs/usr/lib/x86_64-linux-gnu", "/tmp/chromium-libs/root/usr/lib/x86_64-linux-gnu"].filter((d) => existsSync(d));
if (EXTRA_LIBS.length) process.env.LD_LIBRARY_PATH = [...EXTRA_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

async function waitReady(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((resolve) => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); }),
      ),
    );
  });
  await page.waitForTimeout(450);
}

async function capture() {
  const requireFromWeb = createRequire(join(ROOT, "apps", "web", "package.json"));
  const { chromium } = requireFromWeb("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(`file://${join(PREV, "suite-publica.html")}`, { waitUntil: "networkidle" });
  await waitReady(page);
  await page.screenshot({ path: join(CAPS, "suite-completa.png"), fullPage: true });
  await page.addStyleTag({ content: ".toc,.preview-bar{display:none!important}" });
  const clips = [
    ["#home .frame", "suite-home-desktop.png"],
    ["#home .hero", "suite-hero-a.png"],
    ["#movil .phones", "suite-home-mobile.png"],
    ["#catalogo .frame", "suite-catalogo.png"],
    ["#ficha .frame", "suite-ficha.png"],
    ["#sistema", "suite-sistema.png"],
  ];
  for (const [sel, out] of clips) {
    const el = await page.$(sel);
    if (el) await el.screenshot({ path: join(CAPS, out) });
  }
  // Hero en las tres identidades
  for (const t of THEMES) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, t.id);
    await page.waitForTimeout(350);
    const hero = await page.$("#home .hero");
    if (hero) await hero.screenshot({ path: join(CAPS, `suite-hero-${t.id}.png`) });
  }
  await browser.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────────────────────
writeFileSync(join(PREV, "suite-publica.html"), renderDoc());
writeContrastMd();
for (const t of THEMES) console.log(`✅ Tema ${t.id}: ${AUDITS[t.id].rows.length} pares medidos, 0 fallos.`);
console.log("Artefactos: previsualizaciones/suite-publica.html · contraste-suite-publica.md");
if (!NO_PNG) {
  console.log("📸 Capturando la previsualización con Chromium…");
  await capture();
  console.log("Capturas en capturas/");
}
