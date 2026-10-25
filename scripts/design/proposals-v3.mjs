#!/usr/bin/env node
/**
 * Generador de las previsualizaciones y artefactos de las DOS propuestas de identidad visual v3
 * (skill `visual-ui-ux`, Fase 1 + Fase 3) para el Hotel Marina del Sol.
 *
 * Por qué existe: la cultura del proyecto exige **instrumento y artefacto** para cada afirmación
 * de calidad (ADR-23). Aquí la paleta no se describe con palabras: se mide con la misma matemática
 * WCAG 2.1 que el producto (`apps/web/src/lib/a11y/contrast.ts`), se genera una previsualización
 * navegable de la web + AdminLTE + APK y se capturan las pantallas con Chromium. Si un par
 * texto/fondo no llega a su mínimo, el script **falla** (no publica una propuesta no conforme).
 *
 * Salidas (en `RepoTecnico/propuestas_v3_identidad/`):
 *   - `previsualizaciones/propuesta-a-cal-y-sal.html` · `propuesta-b-posidonia.html`
 *   - `previsualizaciones/comparativa.html` · `previsualizaciones/index.html`
 *   - `capturas/*.png` (página completa + landing + admin + móvil + hero + comparativa)
 *   - `tokens/design-tokens-propuesta-*.json` · `tokens/tailwind-preset-propuesta-*.cjs`
 *   - `contraste-propuesta-*.md` (tabla WCAG completa, lista para el manual)
 *
 * Uso:
 *   node scripts/design/proposals-v3.mjs            # genera TODO (requiere Chromium de Playwright)
 *   node scripts/design/proposals-v3.mjs --no-png   # solo HTML + tokens + tablas (sin capturas)
 *
 * Nota de entorno: si Chromium falla por bibliotecas del sistema, este script añade a
 * `LD_LIBRARY_PATH` los directorios conocidos del entorno antes de lanzarlo (ver EXTRA_LIBS).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROPOSALS } from "./proposals-v3.data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "RepoTecnico", "propuestas_v3_identidad");
const PREV = join(OUT, "previsualizaciones");
const CAPS = join(OUT, "capturas");
const TOKENS = join(OUT, "tokens");
const NO_PNG = process.argv.includes("--no-png");
const IMG = "../../../docs/imagenes/";

for (const dir of [OUT, PREV, CAPS, TOKENS]) mkdirSync(dir, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Matemática WCAG 2.1 (idéntica a scripts/design/contrast-audit.mjs y lib/a11y/contrast.ts)
// ─────────────────────────────────────────────────────────────────────────────
const rgb = (hex) => {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
};
const srgb = (channel) => {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const composite = (color, alpha, base) => {
  const c = rgb(color);
  const b = rgb(base);
  const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha));
  return `#${[mix(c[0], b[0]), mix(c[1], b[1]), mix(c[2], b[2])]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
};
const toHsl = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return `hsl(0 0% ${Math.round(l * 100)}%)`;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
};
const fmt = (n) => n.toFixed(2).replace(".", ",");
const alpha = (hex, a) => `rgba(${rgb(hex).join(",")},${a})`;
const isDark = (hex) => luminance(hex) < 0.32;

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de contraste: si un par no cumple, el script NO publica la propuesta.
// ─────────────────────────────────────────────────────────────────────────────
function auditProposal(p) {
  const approved = [];
  const failures = [];
  for (const [fg, bg, where, min = 4.5] of [...p.pairs, ...p.adminPairs]) {
    const value = ratio(p.palette[fg], p.palette[bg]);
    const row = { fg: p.palette[fg], bg: p.palette[bg], fgToken: fg, bgToken: bg, where, value, min };
    approved.push(row);
    if (value < min) failures.push({ ...row, reason: `mínimo ${min}:1` });
  }
  const veils = [];
  for (const v of p.veils) {
    const bgHex = composite(p.palette[v.bg], v.alpha, p.palette[v.base]);
    const value = ratio(p.palette[v.fg], bgHex);
    veils.push({ ...v, fgHex: p.palette[v.fg], bgHex, value });
    if (value < 4.5) failures.push({ ...v, value, reason: "velo < 4,5:1" });
  }
  const prohibited = p.prohibited.map((pr) => ({
    ...pr,
    value: ratio(p.palette[pr.fg], p.palette[pr.bg]),
    fgHex: p.palette[pr.fg],
    bgHex: p.palette[pr.bg],
  }));
  return { approved, veils, prohibited, failures };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS de cada previsualización (una sola plantilla, tokens de la propuesta)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_VARS = (p) => ({
  "--adm-sidebar-bg": `var(--${p.admin.sidebarBg})`,
  "--adm-sidebar-text": `var(--${p.admin.sidebarText})`,
  "--adm-sidebar-muted": `var(--${p.admin.sidebarMuted})`,
  "--adm-hover": `var(--${p.admin.sidebarHover})`,
  "--adm-active-bg": `var(--${p.admin.sideActiveBg})`,
  "--adm-active-text": `var(--${p.admin.sideActiveText})`,
  "--adm-navbar": `var(--${p.admin.navbarBg})`,
  "--adm-page": `var(--${p.admin.pageBg})`,
  "--adm-border": `var(--${p.admin.headerBorder})`,
  "--adm-icon-tile": `var(--${p.admin.iconTile})`,
});

function buildCss(p) {
  const vars = Object.entries(p.palette)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  const radii = Object.entries(p.radii)
    .map(([k, v]) => `  --r-${k}: ${v}px;`)
    .join("\n");
  const adminVars = Object.entries(ADMIN_VARS(p))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const typeCss = p.typeScale
    .map(
      (t) =>
        `.t-${t.key}{font-family:${["display", "h1", "h2", "h3"].includes(t.key) ? "var(--font-display)" : "var(--font-sans)"};font-size:${t.clamp};font-weight:${t.weight};line-height:${t.lineHeight};letter-spacing:${t.letterSpacing};${t.transform === "uppercase" ? "text-transform:uppercase;" : ""}}`,
    )
    .join("\n");
  const veilRgb = rgb(p.palette[p.veils[0].bg]).join(",");
  const veilStrong = p.veils[0].alpha;
  return `
@import url('https://fonts.googleapis.com/css2?family=${p.fonts.display.google}&family=${p.fonts.ui.google}&display=swap');

:root{
${vars}
${radii}
${adminVars}
  --font-display: ${p.fonts.display.stack};
  --font-sans: ${p.fonts.ui.stack};
  --shadow-card: ${p.shadows.card};
  --shadow-hover: ${p.shadows["card-hover"]};
  --shadow-modal: ${p.shadows.modal};
  --ease: ${p.motion.ease};
  --veil: rgba(${veilRgb},${veilStrong});
  --veil-soft: rgba(${veilRgb},0.35);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--mist);color:var(--ink);font-family:var(--font-sans);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,blockquote{font-family:var(--font-display);color:var(--ink);margin:0}
p{margin:0}
a{color:var(--azure);text-decoration:none}
img{max-width:100%;display:block}
button{font:inherit;cursor:pointer}
::selection{background:var(--azure);color:var(--shell)}

${typeCss}

.doc{max-width:1360px;margin:0 auto;padding:40px 28px 96px}
.eyebrow{font-family:var(--font-sans);font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--coral-text)}
.eyebrow--light{color:var(--pearl)}
.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}
.hero-title{font-size:76px;line-height:.95;letter-spacing:-.025em;font-weight:600;margin:10px 0 0}
.hero-title .tag{display:inline-block;vertical-align:middle;margin-left:16px;font-family:var(--font-sans);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;background:var(--azure);color:var(--shell);border-radius:999px;padding:7px 14px;transform:translateY(-12px)}
.tagline{font-family:var(--font-display);font-size:26px;font-style:italic;color:var(--ink-soft);margin-top:6px}
.chips{display:flex;gap:8px;flex-wrap:wrap;max-width:430px;justify-content:flex-end}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;border:1px solid var(--line-strong);border-radius:999px;padding:6px 12px;background:var(--shell);color:var(--ink)}
.chip--ok{background:var(--success-bg);border-color:var(--success);color:var(--success)}
.chip--tag{background:var(--coral);border-color:var(--coral);color:var(--shell)}
.lede{max-width:74ch;margin-top:22px;font-size:19px;line-height:1.6;color:var(--ink-soft)}
.lede strong{color:var(--ink);font-weight:600}
.strip{display:flex;gap:0;margin-top:26px;border-radius:var(--r);overflow:hidden;border:1px solid var(--line);height:54px}
.strip span{flex:1}
.strip span:first-child{flex:2}
.toc{position:sticky;top:0;z-index:30;display:flex;gap:2px;flex-wrap:wrap;padding:12px 0;margin:30px 0 0;background:linear-gradient(var(--mist) 72%,transparent);border-bottom:1px solid var(--line)}
.toc a{font-size:12.5px;font-weight:600;color:var(--ink-soft);padding:7px 12px;border-radius:999px}
.toc a:hover{background:var(--mist-2);color:var(--ink)}
.block{margin-top:74px;scroll-margin-top:74px}
.block-head{display:flex;justify-content:space-between;align-items:flex-end;gap:28px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
.block-head h2{font-size:34px;line-height:1.1;font-weight:600;margin-top:6px;letter-spacing:-.015em}
.note{max-width:46ch;font-size:13.5px;line-height:1.55;color:var(--ink-soft)}
.card{background:var(--shell);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-card)}

/* 01 · Color */
.sw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:24px}
.sw{background:var(--shell);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-card)}
.sw-color{height:88px;display:flex;align-items:flex-end;justify-content:space-between;padding:10px 12px}
.sw-code{font-family:var(--font-sans);font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 7px;border-radius:6px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.82);color:#101010}
.sw-body{padding:10px 12px 12px}
.sw-role{font-size:13px;font-weight:700}
.sw-use{font-size:11.5px;line-height:1.35;color:var(--ink-soft);margin-top:3px;min-height:31px}
.sw-meta{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:7px;font-size:10.5px;color:var(--ink-soft)}
.ratio{font-family:var(--font-sans);font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--success-bg);color:var(--success);white-space:nowrap}
.ratio--border{background:var(--info-bg);color:var(--info)}
.ratio--n/a{background:var(--warning-bg);color:var(--warning)}

/* 02 · Tipografía */
.type-grid{display:grid;grid-template-columns:1.12fr .88fr;gap:20px;margin-top:24px;align-items:start}
.specimen{padding:28px 30px 26px}
.specimen .display-line{font-size:64px;line-height:1;letter-spacing:-.025em;font-weight:600}
.specimen .display-line em{font-style:italic;color:var(--coral-text)}
.specimen .h2-line{font-size:30px;line-height:1.14;margin-top:18px;font-weight:600}
.specimen .body-line{font-size:17px;line-height:1.6;color:var(--ink-soft);margin-top:12px;max-width:52ch}
.specimen .cyr{display:flex;gap:14px;flex-wrap:wrap;margin-top:16px;font-size:13px;color:var(--ink-soft)}
.cyr b{font-weight:600;color:var(--ink)}
.scale{width:100%;border-collapse:collapse;font-size:12px}
.scale th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);padding:9px 10px;border-bottom:1px solid var(--line);background:var(--mist-2)}
.scale td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.scale td:first-child{font-weight:600;white-space:nowrap}
.scale tr:last-child td{border-bottom:0}
.brand-card{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:0;overflow:hidden;margin-top:14px}
.brand-tile{padding:24px 26px;display:flex;flex-direction:column;justify-content:center;gap:14px;min-height:168px;border-right:1px solid var(--line)}
.brand-tile:last-child{border-right:0}
.brand-tile--dark{background:var(--navy);color:var(--mist)}
.brand-tile--dark .brand strong,.brand-tile--dark .brand em{color:var(--mist)}
.brand-tile--dark .brand em{color:var(--pearl)}
.brand-tile--dark .monogram{background:var(--pearl);color:var(--navy)}
.brand-lock{display:flex;align-items:center;gap:12px}
.brand-lock .monogram{width:44px;height:44px;font-size:17px}
.brand-lock strong{display:block;font-family:var(--font-sans);font-size:13px;letter-spacing:.2em;font-weight:700}
.brand-lock em{display:block;font-style:normal;font-size:9.5px;letter-spacing:.15em;color:var(--ink-soft);margin-top:2px}
.brand-tile--dark .brand-lock em{color:var(--pearl)}
.brand-caption{font-size:10.5px;line-height:1.45;color:var(--ink-soft)}
.brand-tile--dark .brand-caption{color:var(--pearl)}
.font-notes{display:flex;gap:14px;margin-top:14px;flex-wrap:wrap}
.font-note{flex:1 1 240px;background:var(--mist-2);border-radius:var(--r-sm);padding:12px 14px;font-size:12px;line-height:1.5;color:var(--ink-soft)}
.font-note b{display:block;color:var(--ink);font-size:13px;margin-bottom:2px}

/* 03 · Web */
.frame{border:1px solid var(--line);border-radius:22px;overflow:hidden;background:var(--shell);box-shadow:var(--shadow-modal);margin-top:24px}
.browser{height:42px;background:var(--mist-2);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:7px;padding:0 16px}
.browser i{width:10px;height:10px;border-radius:50%;background:var(--line-strong);opacity:.55}
.browser .url{margin:0 auto;background:var(--shell);border:1px solid var(--line);border-radius:999px;font-size:11.5px;padding:4px 18px;color:var(--ink-soft)}
.browser .note{font-size:10.5px;color:var(--ink-soft);letter-spacing:.08em;text-transform:uppercase}
.site{font-size:15px;background:var(--mist)}
.site-nav{display:flex;align-items:center;gap:26px;padding:15px 34px;background:var(--shell);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:11px;min-width:220px}
.monogram{width:40px;height:40px;border-radius:50%;background:var(--azure);color:var(--shell);display:grid;place-items:center;font-family:var(--font-display);font-size:16px;font-weight:600;flex:none}
.monogram--sm{width:32px;height:32px;font-size:13px}
.brand strong{display:block;font-size:12px;letter-spacing:.18em;font-weight:700}
.brand em{display:block;font-style:normal;font-size:9.5px;letter-spacing:.14em;color:var(--ink-soft);margin-top:1px}
.site-links{display:flex;gap:22px;font-size:13px;color:var(--ink-soft)}
.site-actions{margin-left:auto;display:flex;align-items:center;gap:14px}
.site-actions .lang{font-size:10.5px;letter-spacing:.1em;color:var(--ink-soft)}
.hero{position:relative;min-height:560px;background-size:cover;background-position:center;display:flex;align-items:center;padding:56px 54px}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(${veilRgb},.58),rgba(${veilRgb},.88))}
.hero-copy{position:relative;z-index:2;max-width:660px;color:var(--shell)}
.hero-copy h1{font-size:64px;line-height:1.01;letter-spacing:-.02em;color:var(--shell);font-weight:600;margin-top:14px}
.hero-copy h1 em{font-style:italic;color:var(--pearl)}
.hero-lead{font-size:16px;line-height:1.6;color:rgba(255,255,255,.9);margin-top:16px;max-width:50ch}
.hero-cta{display:flex;gap:12px;margin-top:26px}
.booking{margin:-42px 34px 0;position:relative;z-index:3;background:var(--shell);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow-card);padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:center}
.b-field{border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:8px 12px;background:var(--shell)}
.b-field span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}
.b-field strong{display:block;font-size:14px;line-height:1.2;margin-top:2px}
.b-field em{display:block;font-style:normal;font-size:10.5px;color:var(--ink-soft)}
.site-section{padding:42px 34px 10px}
.site-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.site-head h2{font-size:34px;line-height:1.1;letter-spacing:-.015em;font-weight:600;margin-top:6px}
.text-link{font-size:12.5px;font-weight:600}
.rooms{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:22px}
.room{background:var(--shell);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--shadow-card)}
.room-img{height:176px;background-size:cover;background-position:center;position:relative}
.room-badge{position:absolute;left:12px;top:12px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:var(--shell);color:var(--ink);border-radius:999px;padding:5px 10px}
.room-badge--premium{background:var(--amber);color:var(--shell)}
.room-badge--available{background:var(--fern);color:var(--shell)}
.room-body{padding:14px 16px 16px}
.room-type{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral-text)}
.room-body h3{font-size:22px;line-height:1.15;margin-top:5px;font-weight:600}
.room-meta{font-size:11.5px;color:var(--ink-soft);margin-top:4px}
.room-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.room-price{font-family:var(--font-display);font-size:23px;font-weight:600;line-height:1}
.room-price small{font-family:var(--font-sans);font-size:10px;font-weight:500;color:var(--ink-soft)}
.split{display:grid;grid-template-columns:1.05fr .95fr;gap:0;margin:46px 34px 0;border-radius:var(--r);overflow:hidden;border:1px solid var(--line);background:var(--shell)}
.split-img{min-height:310px;background-size:cover;background-position:center}
.split-copy{padding:34px 36px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;background:var(--mist-2)}
.split-copy h2{font-size:32px;line-height:1.12;margin-top:8px;font-weight:600}
.split-copy p{font-size:14px;line-height:1.6;color:var(--ink-soft);margin-top:10px;max-width:44ch}
.quote{padding:44px 34px 10px;display:flex;flex-direction:column;align-items:center;text-align:center}
.quote blockquote{font-size:30px;line-height:1.32;font-style:italic;max-width:760px;margin-top:12px;color:var(--ink)}
.quote-author{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);margin-top:16px}
.site-footer{background:var(--navy);color:var(--mist);padding:30px 34px;margin-top:40px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:center}
.site-footer .brand strong,.site-footer .brand em{color:var(--mist)}
.site-footer .brand em{color:var(--pearl)}
.site-footer nav{display:flex;gap:20px;font-size:11.5px;color:var(--pearl)}
.site-footer .legal{font-size:10.5px;color:var(--pearl);opacity:.85}

/* Botones y controles de la demo */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:var(--r-sm);font-size:13.5px;font-weight:600;border:1px solid transparent;transition:background .18s var(--ease),color .18s var(--ease),transform .18s var(--ease),box-shadow .18s var(--ease)}
.btn-sm{min-height:38px;padding:0 15px;font-size:12px;border-radius:calc(var(--r-sm) - 2px)}
.btn-primary{background:var(--azure);color:var(--shell)}
.btn-primary:hover{background:var(--azure-deep)}
.btn-secondary{background:var(--shell);color:var(--ink);border-color:var(--line-strong)}
.btn-secondary:hover{background:var(--mist-2)}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line-strong)}
.btn-ghost-light{background:transparent;color:var(--shell);border-color:rgba(255,255,255,.55)}
.btn-danger{background:var(--error);color:var(--shell)}
.btn-disabled{background:var(--mist-2);color:var(--ink-soft);border-color:var(--line);cursor:not-allowed;opacity:.75}
.btn-focus{box-shadow:0 0 0 4px var(--mist-2),0 0 0 6px var(--azure);outline:none}
.btn-block{width:100%}

/* 04 · Móvil y APK */
.phones{display:flex;gap:30px;justify-content:center;align-items:flex-start;flex-wrap:wrap;margin-top:26px}
.phone{width:376px;height:752px;border-radius:48px;background:#0c1014;padding:9px;flex:none;box-shadow:0 32px 64px rgba(0,0,0,.24),0 0 0 1px rgba(255,255,255,.06) inset;position:relative}
.phone::after{content:"";position:absolute;top:16px;left:50%;transform:translateX(-50%);width:104px;height:26px;border-radius:999px;background:#0c1014;z-index:5}
.screen{position:relative;height:100%;border-radius:40px;overflow:hidden;background:var(--mist);display:flex;flex-direction:column}
.sbar{height:36px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:11px;font-weight:700;color:var(--ink)}
.sbar span:last-child{letter-spacing:2px;font-size:9px}
.app-nav{height:50px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:var(--shell);border-bottom:1px solid var(--line)}
.wordmark-sm{font-size:10px;font-weight:700;letter-spacing:.16em}
.app-nav .iconbtn{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--shell);color:var(--ink);display:grid;place-items:center;font-size:14px;padding:0}
.scr{flex:1;overflow:hidden;display:flex;flex-direction:column}
.mhero{height:216px;background-size:cover;background-position:center;position:relative;display:flex;align-items:flex-end;padding:22px 20px}
.mhero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(${veilRgb},.2),rgba(${veilRgb},.86))}
.mhero-copy{position:relative;z-index:2;color:var(--shell)}
.mhero-copy h2{font-size:27px;line-height:1.06;color:var(--shell);font-weight:600;margin-top:6px}
.mhero-copy h2 em{font-style:italic;color:var(--pearl)}
.mbooking{margin:-26px 16px 0;position:relative;z-index:3;padding:12px;border-radius:var(--r);background:var(--shell);border:1px solid var(--line);box-shadow:var(--shadow-card);display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mbooking .b-field{padding:7px 10px}
.mbooking .btn{grid-column:1/-1;min-height:40px;font-size:12.5px}
.mlist{padding:18px 16px 70px;flex:1}
.mlist .overline{margin-bottom:10px}
.mrow{display:flex;align-items:center;gap:11px;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-sm);padding:9px;margin-bottom:9px}
.mrow img{width:52px;height:52px;border-radius:calc(var(--r-sm) - 3px);object-fit:cover;flex:none}
.mrow strong{display:block;font-size:12.5px}
.mrow span{display:block;font-size:10.5px;color:var(--ink-soft);margin-top:1px}
.mrow b{margin-left:auto;font-family:var(--font-display);font-size:18px;font-weight:600}
.tabbar{position:absolute;bottom:0;left:0;right:0;height:66px;background:var(--shell);border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-around;padding-bottom:6px}
.tabbar span{font-size:9.5px;color:var(--ink-soft);display:flex;flex-direction:column;align-items:center;gap:3px;font-weight:600}
.tabbar span i{font-style:normal;font-size:16px}
.tabbar .is-active{color:var(--azure)}
.app-head{padding:14px 18px 10px;display:flex;justify-content:space-between;align-items:center;background:var(--shell)}
.app-head h3{font-size:20px;font-weight:600;line-height:1.1}
.app-head span{font-size:10.5px;color:var(--ink-soft)}
.avatar{width:34px;height:34px;border-radius:50%;background:var(--azure);color:var(--shell);display:grid;place-items:center;font-size:12px;font-weight:700}
.app-body{padding:14px 16px 76px;overflow:hidden;flex:1;display:flex;flex-direction:column;gap:11px}
.greeting{font-size:13px;color:var(--ink-soft)}
.ticket{background:var(--navy);color:var(--mist);border-radius:var(--r);padding:16px;display:flex;gap:14px;position:relative;overflow:hidden}
.ticket::after{content:"";position:absolute;right:-26px;top:-26px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.06)}
.ticket-qr{background:var(--shell);border-radius:10px;padding:6px;width:92px;height:92px;flex:none}
.ticket-qr svg{width:100%;height:100%;display:block}
.ticket-info{min-width:0}
.ticket-info .overline{color:var(--pearl);font-size:9px}
.ticket-info h3{font-size:20px;color:var(--shell);line-height:1.1;margin-top:4px;font-weight:600}
.ticket-info p{font-size:11px;color:var(--pearl);margin-top:4px}
.ticket-chip{display:inline-flex;margin-top:8px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;background:var(--fern);color:var(--shell);padding:4px 8px;border-radius:999px}
.pill-row{display:flex;gap:6px;flex-wrap:wrap}
.pill{font-size:9.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:var(--mist-2);color:var(--ink-soft)}
.pill--ok{background:var(--success-bg);color:var(--success)}
.pill--warn{background:var(--warning-bg);color:var(--warning)}
.pill--err{background:var(--error-bg);color:var(--error)}
.actions-row{display:flex;gap:9px}
.actions-row .btn{flex:1;min-height:42px;font-size:12px}
.progress{height:8px;border-radius:999px;background:var(--mist-2);overflow:hidden}
.progress i{display:block;height:100%;width:64%;background:var(--azure);border-radius:999px}
.room-row{display:flex;align-items:center;gap:10px;background:var(--shell);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 11px}
.room-row .num{font-family:var(--font-display);font-size:20px;font-weight:600;width:44px;flex:none}
.room-row .who{font-size:11px;color:var(--ink-soft);min-width:0}
.room-row .who strong{display:block;color:var(--ink);font-size:12px;font-weight:600}
.room-row .btn{margin-left:auto;min-height:34px;font-size:11px;padding:0 11px}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--fern);flex:none}

/* 05 · AdminLTE */
.admin-frame{display:flex;min-height:700px;margin-top:24px;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--adm-page);box-shadow:var(--shadow-modal)}
.adm-side{width:258px;flex:none;background:var(--adm-sidebar-bg);color:var(--adm-sidebar-text);display:flex;flex-direction:column;border-right:1px solid var(--line)}
.adm-brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid rgba(127,127,127,.22)}
.adm-brand strong{display:block;font-size:11px;letter-spacing:.16em;font-weight:700}
.adm-brand em{display:block;font-style:normal;font-size:9px;letter-spacing:.12em;opacity:.75;margin-top:1px}
.adm-sec{padding:16px 18px 5px;font-size:9.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--adm-sidebar-muted)}
.adm-item{display:flex;align-items:center;gap:10px;margin:1px 10px;padding:9px 11px;border-radius:var(--r-sm);font-size:12.5px;line-height:1.2;color:var(--adm-sidebar-text)}
.adm-item i{font-style:normal;width:18px;text-align:center;font-size:14px;opacity:.9}
.adm-item.is-active{background:var(--adm-active-bg);color:var(--adm-active-text);font-weight:600}
.adm-item.is-hover{background:var(--adm-hover)}
.adm-item .lock{margin-left:auto;font-size:10px;opacity:.55;display:inline-flex;align-items:center}
.adm-item .chev{margin-left:auto;font-size:11px;opacity:.7}
.adm-section{font-weight:600;text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;padding:10px 11px}
.adm-section.is-open{color:var(--adm-sidebar-text)}
.adm-sub{padding:2px 0 4px}
.adm-sub .adm-item{padding-left:32px;font-size:12px}
.adm-session{margin-top:auto;padding:14px 16px;border-top:1px solid rgba(127,127,127,.22);font-size:10.5px;color:var(--adm-sidebar-muted)}
.adm-session b{display:block;color:var(--adm-sidebar-text);font-size:11.5px;margin-bottom:4px}
.adm-main{flex:1;min-width:0;display:flex;flex-direction:column}
.adm-nav{height:64px;flex:none;background:var(--adm-navbar);border-bottom:1px solid var(--adm-border);display:flex;align-items:center;gap:14px;padding:0 20px}
.adm-nav .iconbtn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line-strong);background:var(--shell);color:var(--ink);display:grid;place-items:center;padding:0}
.adm-search{flex:1;max-width:420px;display:flex;align-items:center;gap:8px;background:var(--mist);border:1px solid var(--line-strong);border-radius:999px;padding:8px 14px;font-size:12px;color:var(--ink-soft)}
.adm-nav-right{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12px;color:var(--ink-soft)}
.adm-content{padding:22px 24px 26px;display:flex;flex-direction:column;gap:16px;flex:1}
.adm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;flex-wrap:wrap}
.crumbs{font-size:11px;color:var(--ink-soft)}
.adm-head h2{font-size:30px;line-height:1.1;letter-spacing:-.015em;font-weight:600;margin-top:4px}
.adm-sub{font-size:11.5px;color:var(--ink-soft);margin-top:3px}
.adm-actions{display:flex;gap:8px}
.adm-actions .btn{min-height:38px;font-size:12px;padding:0 14px}
.adm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
.kpi{position:relative;background:var(--shell);border:1px solid var(--line);border-radius:var(--r);padding:14px 15px;box-shadow:var(--shadow-card)}
.kpi .label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}
.kpi .value{font-family:var(--font-display);font-size:29px;font-weight:600;line-height:1.05;margin-top:6px}
.kpi .delta{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;margin-top:5px;color:var(--fern)}
.kpi .delta.down{color:var(--coral-text)}
.kpi .icon{position:absolute;right:12px;top:12px;width:38px;height:38px;border-radius:11px;background:var(--adm-icon-tile);color:var(--azure);display:grid;place-items:center;font-size:16px}
.adm-grid{display:grid;grid-template-columns:1.55fr 1fr;gap:14px}
.adm-grid2{display:grid;grid-template-columns:1.55fr 1fr;gap:14px}
.card-head{padding:12px 15px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:600}
.card-head span{font-size:10.5px;color:var(--ink-soft);font-weight:500}
.chart{padding:14px 15px 10px;height:190px;display:flex;align-items:flex-end;gap:9px}
.chart .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;height:100%}
.chart .bar{background:var(--azure);border-radius:6px 6px 3px 3px;min-height:6px}
.chart .bar--alt{background:var(--amber)}
.chart-legend{display:flex;gap:14px;padding:0 15px 14px;font-size:10.5px;color:var(--ink-soft)}
.chart-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--azure);margin-right:5px}
.chart-legend i.alt{background:var(--amber)}
.timeline{padding:8px 15px 14px;display:flex;flex-direction:column;gap:11px}
.tl{display:flex;gap:10px;font-size:11.5px;line-height:1.4}
.tl .dot{width:8px;height:8px;border-radius:50%;background:var(--azure);flex:none;margin-top:4px}
.tl .dot.ok{background:var(--fern)}
.tl .dot.warn{background:var(--amber)}
.tl b{display:block;font-size:11.5px}
.tl span{color:var(--ink-soft);font-size:10.5px}
.adm-table{width:100%;border-collapse:collapse;font-size:11.5px}
.adm-table th{background:var(--mist-2);text-align:left;padding:8px 13px;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);border-bottom:1px solid var(--line)}
.adm-table td{padding:9px 13px;border-bottom:1px solid var(--line)}
.adm-table tr:last-child td{border-bottom:0}
.adm-table .status{font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:999px;display:inline-block}
.st-ok{background:var(--success-bg);color:var(--success)}
.st-warn{background:var(--warning-bg);color:var(--warning)}
.st-err{background:var(--error-bg);color:var(--error)}
.st-info{background:var(--info-bg);color:var(--info)}
.adm-list{padding:10px 15px 14px;display:flex;flex-direction:column;gap:9px}
.adm-list-row{display:flex;align-items:center;gap:9px;font-size:11.5px}
.adm-list-row b{margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--warning-bg);color:var(--warning)}
.adm-footnote{font-size:10px;color:var(--ink-soft);text-align:right}

/* 06 · Componentes */
.comp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px}
.comp{padding:16px 17px}
.comp>.overline{font-size:9.5px;letter-spacing:.14em;margin-bottom:12px;color:var(--coral-text)}
.comp .stack{display:flex;flex-direction:column;gap:9px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.field label{display:block;font-size:10.5px;font-weight:700;margin-bottom:4px}
.field input,.field select{width:100%;height:40px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--shell);padding:0 11px;font:inherit;font-size:12.5px;color:var(--ink)}
.field .help{font-size:10px;color:var(--ink-soft);margin-top:4px}
.field.error input{border-color:var(--error);box-shadow:0 0 0 3px var(--error-bg)}
.field.error .help{color:var(--error);font-weight:600}
.badges{display:flex;gap:6px;flex-wrap:wrap}
.badge{font-size:9.5px;font-weight:700;letter-spacing:.06em;padding:4px 9px;border-radius:999px;background:var(--mist-2);color:var(--ink-soft)}
.badge--suite{background:var(--amber);color:${p.id === "A" ? "var(--shell)" : "var(--ink)"}}
.badge--resale{background:var(--coral);color:var(--shell)}
.badge--free{background:var(--fern);color:var(--shell)}
.badge--error{background:var(--error-bg);color:var(--error)}
.mini-table{width:100%;border-collapse:collapse;font-size:11px}
.mini-table th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);padding:6px 8px;border-bottom:1px solid var(--line)}
.mini-table td{padding:7px 8px;border-bottom:1px solid var(--line)}
.empty{background:var(--mist-2);border:1px dashed var(--line-strong);border-radius:var(--r-sm);padding:16px;text-align:center;font-size:11.5px;color:var(--ink-soft)}
.empty b{display:block;color:var(--ink);font-size:13px;margin-bottom:2px}
.focus-demo{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:var(--r-sm);background:var(--shell);border:1px solid var(--line-strong);font-size:12.5px;font-weight:600;box-shadow:0 0 0 4px var(--mist-2),0 0 0 6px var(--azure)}
.swatches-mini{display:flex;gap:5px;margin-top:2px}
.swatches-mini i{width:22px;height:22px;border-radius:6px;border:1px solid rgba(0,0,0,.08)}

/* 07 · Contraste */
.contrast{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin-top:24px;align-items:start}
.ctable{width:100%;border-collapse:collapse;font-size:11.5px}
.ctable th{text-align:left;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft);padding:8px 10px;border-bottom:1px solid var(--line);background:var(--mist-2)}
.ctable td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.ctable tr:last-child td{border-bottom:0}
.pair{display:flex;align-items:center;gap:6px}
.pair i{width:16px;height:16px;border-radius:5px;border:1px solid rgba(0,0,0,.14);display:inline-block}
.ok{color:var(--success);font-weight:700}
.ko{color:var(--error);font-weight:700}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.sum{background:var(--shell);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow-card)}
.sum b{display:block;font-family:var(--font-display);font-size:30px;line-height:1;font-weight:600}
.sum span{display:block;font-size:10.5px;color:var(--ink-soft);margin-top:5px}
.foot{margin-top:64px;border-top:1px solid var(--line);padding-top:18px;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:11px;color:var(--ink-soft)}
.foot code{font-size:10.5px;background:var(--mist-2);padding:2px 6px;border-radius:5px}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de previsualización
// ─────────────────────────────────────────────────────────────────────────────
const qrSvg = (px = 92) => {
  const n = 25;
  const seed = (x, y) => ((x * 73856093) ^ (y * 19349663)) % 97;
  const finder = (x, y) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
  let cells = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (finder(x, y)) continue;
      if (seed(x, y) % 3 === 0) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const finders = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]
    .map(
      ([x, y]) =>
        `<rect x="${x}" y="${y}" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" role="img" aria-label="Código QR del pase de la noche" fill="currentColor">${cells}${finders}</svg>`;
};

const swatchPair = (p, token) => {
  const bgish = ["mist", "mist-2", "shell", "arena"];
  if (bgish.includes(token)) return ["ink", token];
  if (token === "ink") return ["ink", "mist"];
  if (token === "ink-soft") return ["ink-soft", "mist"];
  if (token === "line") return ["ink", "line"];
  if (token === "line-strong") return ["line-strong", "shell"];
  if (["azure", "azure-deep", "agua", "coral", "fern"].includes(token)) return ["shell", token];
  if (token === "navy" || token === "navy-soft") return ["shell", token];
  if (token === "pearl") return ["pearl", "navy"];
  if (token === "coral-text") return ["coral-text", "shell"];
  if (token === "amber") return p.id === "A" ? ["shell", "amber"] : ["ink", "amber"];
  const stateBg = `${token}-bg`;
  if (p.palette[stateBg]) return [token, stateBg];
  return [token, "mist"];
};

function miniStrip(p) {
  const order = ["mist", "mist-2", "shell", "arena", "ink", "azur", "azure", "navy", "pearl", "coral", "amber", "fern"];
  const tokens = order.filter((t) => p.palette[t]);
  if (p.palette.agua) tokens.splice(7, 0, "agua");
  return `<div class="strip">${tokens
    .map((t) => `<span style="background:var(--${t})"></span>`)
    .join("")}</div>`;
}

function sectionHead(num, label, title, note) {
  return `<div class="block-head"><div><p class="eyebrow">${num} · ${label}</p><h2>${title}</h2></div>${note ? `<p class="note">${note}</p>` : ""}</div>`;
}

function renderSwatches(p, audit) {
  return `<div class="sw-grid">${p.roles
    .map((r) => {
      const hex = p.palette[r.token];
      const [fg, bg] = swatchPair(p, r.token);
      const value = ratio(p.palette[fg], p.palette[bg]);
      const isBorder = r.token === "line-strong";
      const verdict = isBorder ? "≥3:1" : value >= 7 ? "AAA" : "AA";
      const cls = isBorder ? "ratio ratio--border" : "ratio";
      return `<article class="sw">
  <div class="sw-color" style="background:var(--${r.token})"><span class="sw-code">${hex}</span></div>
  <div class="sw-body">
    <p class="sw-role">${r.role}</p>
    <p class="sw-use">${r.use}</p>
    <div class="sw-meta"><span>${toHsl(hex)}</span><span class="${cls}" title="${p.palette[fg]} sobre ${p.palette[bg]}">${verdict} · ${fmt(value)}:1</span></div>
    <div class="sw-meta"><span>token <b>${r.token}</b></span><span>${fg} / ${bg}</span></div>
  </div>
</article>`;
    })
    .join("")}</div>`;
}

function renderTypography(p) {
  const rows = p.typeScale
    .map(
      (t) => `<tr><td>${t.key}</td><td>${t.px} px</td><td>${t.weight}</td><td>${t.lineHeight}</td><td>${t.letterSpacing}</td><td>${t.use}</td></tr>`,
    )
    .join("");
  return `<div class="type-grid">
  <div class="card specimen">
    <p class="eyebrow">${p.fonts.display.family} 600 · display</p>
    <p class="display-line">El mar entra<br><em>en la habitación.</em></p>
    <p class="h2-line">${p.id === "A" ? "Habitaciones con luz de poniente" : "Frescura operativa, noche a noche"}</p>
    <p class="body-line">Texto base de 17&nbsp;px con interlineado 1,55. La hospitalidad se lee antes de entender el producto: vocabulario de viajero, nunca de cripto.</p>
    <div class="cyr"><span><b>ES</b> Noches en propiedad</span><span><b>EN</b> Nights you own</span><span><b>RU</b> Ночи у моря · Бронирование</span></div>
    <p class="eyebrow" style="margin-top:18px;color:var(--coral-text)">${p.fonts.ui.family} · interfaz y datos</p>
    <p style="font-family:var(--font-sans);font-size:15px;margin-top:6px">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz · 0123456789 € % · АБВГДЕЖЗИЙ</p>
    <div style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px;display:grid;gap:7px">
      <p class="overline" style="font-size:11px;letter-spacing:${p.typeScale.find((t) => t.key === "overline").letterSpacing};color:var(--coral-text)">Overline · 12 px · 600 · ${p.typeScale.find((t) => t.key === "overline").letterSpacing}</p>
      <p style="font-family:var(--font-sans);font-size:13px;color:var(--ink-soft)">Caption 13 px · metadatos, pie de foto y ayudas de formulario.</p>
      <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px">Code · 0x7f3a9c…e21c · tokenId #1284</p>
    </div>
  </div>
  <div>
    <div class="card" style="overflow:hidden"><table class="scale"><thead><tr><th>Nivel</th><th>Tamaño</th><th>Peso</th><th>Interlineado</th><th>Tracking</th><th>Uso</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="font-notes">
      <p class="font-note"><b>${p.fonts.display.family}</b>${p.fonts.display.why}</p>
      <p class="font-note"><b>${p.fonts.ui.family}</b>${p.fonts.ui.why}</p>
    </div>
  </div>
</div>`;
}

function renderBrand(p) {
  return `<div class="card brand-card">
    <div class="brand-tile">
      <div class="brand-lock"><span class="monogram">M·S</span><span><strong>MARINA DEL SOL</strong><em>ALICANTE · COSTA BLANCA</em></span></div>
      <p class="brand-caption">Lockup principal sobre ${p.id === "A" ? "caliza" : "bruma"}: monograma en disco ${p.id === "A" ? "azul mar" : "posidonia"} + nombre en mayúsculas con tracking 0,20 em.</p>
    </div>
    <div class="brand-tile brand-tile--dark">
      <div class="brand-lock"><span class="monogram">M·S</span><span><strong>MARINA DEL SOL</strong><em>ALICANTE · COSTA BLANCA</em></span></div>
      <p class="brand-caption">Versión negativa sobre ${p.id === "A" ? "noche" : "abismo"}: monograma en ${p.id === "A" ? "sal" : "perla"}. Es la que va en el pie, el hero y la imagen social.</p>
    </div>
    <div class="brand-tile">
      <span class="monogram" style="width:56px;height:56px;font-size:20px">M·S</span>
      <p class="brand-caption">Monograma suelto para avatar, favicon y app icon (adaptive icon: fondo ${p.id === "A" ? "azul mar" : "posidonia"}, glifo ${p.id === "A" ? "caliza" : "bruma"}). Área de respeto = altura de la «M».</p>
    </div>
  </div>`;
}

function renderLanding(p) {
  const portada = `${IMG}201-Suite-2026-09-28-1.jpg`;
  const roomA = `${IMG}101-Simple-2026-09-28-1.jpg`;
  const roomB = `${IMG}201-Suite-2026-09-28-1.jpg`;
  const roomC = `${IMG}116-Doble-2026-09-28-1.jpg`;
  const copy =
    p.id === "A"
      ? {
          h1: "El mar entra<br><em>en la habitación.</em>",
          lead: "Cincuenta habitaciones frente al Mediterráneo. Noches en propiedad, trazables y revendibles, sin perder la hospitalidad de siempre.",
          eyebrow: "Alicante · Costa Blanca · desde 1998",
          expTitle: "La terraza, a las siete.",
          expText: "Desayuno de mercado, sombra de cañizo y el agua a un paso. La experiencia empieza antes de la reserva y sigue después del check-out.",
          quote: "Reservamos directo y la noche quedó en nuestra cartera. Al día siguiente estábamos desayunando frente al mar.",
        }
      : {
          h1: "Despierta<br><em>mirando al mar.</em>",
          lead: "Noches en propiedad sobre la costa de Alicante: reserva directa, trazabilidad en cadena y la calma de un hotel de verdad.",
          eyebrow: "Alicante · Costa Blanca · posidonia y cal",
          expTitle: "Menos ruido, más mar.",
          expText: "Una estancia sostenible, sin fricción: reserva en tres pasos, pase digital y todo lo que necesitas a un toque en el móvil.",
          quote: "Compré la noche desde el móvil y en recepción solo tuve que enseñar el pase. Lo demás, sencillamente funcionó.",
        };
  const btnGhost = "btn-ghost-light";
  return `<div class="frame">
  <div class="browser"><i></i><i></i><i></i><span class="url">hotelmarinadelsol.es</span><span class="note">previsualización · ${p.name}</span></div>
  <div class="site">
    <header class="site-nav">
      <div class="brand"><span class="monogram">M·S</span><span><strong>MARINA DEL SOL</strong><em>ALICANTE · COSTA BLANCA</em></span></div>
      <nav class="site-links"><a>Habitaciones</a><a>Experiencias</a><a>El hotel</a><a>Reventa</a></nav>
      <div class="site-actions"><span class="lang">ES · EN · RU</span><button class="btn btn-primary btn-sm">Reservar</button></div>
    </header>
    <div class="hero" style="background-image:url('${portada}')">
      <div class="hero-copy">
        <p class="eyebrow eyebrow--light">${copy.eyebrow}</p>
        <h1>${copy.h1}</h1>
        <p class="hero-lead">${copy.lead}</p>
        <div class="hero-cta"><button class="btn btn-primary">Reservar una noche</button><button class="btn ${btnGhost}">Ver habitaciones</button></div>
      </div>
    </div>
    <div class="booking">
      <div class="b-field"><span>Entrada</span><strong>12 oct</strong><em>sábado</em></div>
      <div class="b-field"><span>Salida</span><strong>15 oct</strong><em>martes · 3 noches</em></div>
      <div class="b-field"><span>Huéspedes</span><strong>2 personas</strong><em>1 habitación</em></div>
      <button class="btn btn-primary btn-block" style="height:56px">Buscar disponibilidad</button>
    </div>
    <section class="site-section">
      <div class="site-head"><div><p class="eyebrow">Habitaciones</p><h2>Elige tu vista al mar</h2></div><a class="text-link">Ver las 50 habitaciones →</a></div>
      <div class="rooms">
        <article class="room"><div class="room-img" style="background-image:url('${roomA}')"><span class="room-badge room-badge--available">Disponible</span></div><div class="room-body"><p class="room-type">Doble</p><h3>Doble con terraza</h3><p class="room-meta">2 personas · 22 m² · balcón al patio</p><div class="room-foot"><span class="room-price">92 €<small> /noche</small></span><button class="btn btn-secondary btn-sm">Reservar</button></div></div></article>
        <article class="room"><div class="room-img" style="background-image:url('${roomB}')"><span class="room-badge room-badge--premium">Suite</span></div><div class="room-body"><p class="room-type">Suite</p><h3>Suite vista mar</h3><p class="room-meta">3 personas · 38 m² · salón y terraza</p><div class="room-foot"><span class="room-price">148 €<small> /noche</small></span><button class="btn btn-secondary btn-sm">Reservar</button></div></div></article>
        <article class="room"><div class="room-img" style="background-image:url('${roomC}')"><span class="room-badge">Últimas 3</span></div><div class="room-body"><p class="room-type">Familiar</p><h3>Doble familiar</h3><p class="room-meta">4 personas · 30 m² · dos camas</p><div class="room-foot"><span class="room-price">118 €<small> /noche</small></span><button class="btn btn-secondary btn-sm">Reservar</button></div></div></article>
      </div>
    </section>
    <section class="split"><div class="split-img" style="background-image:url('${roomB}')"></div><div class="split-copy"><p class="eyebrow">Experiencias</p><h2>${copy.expTitle}</h2><p>${copy.expText}</p><button class="btn btn-secondary" style="margin-top:18px">Descubrir experiencias</button></div></section>
    <section class="quote"><p class="eyebrow">Huéspedes verificados</p><blockquote>“${copy.quote}”</blockquote><p class="quote-author">Marta &amp; Luis · Suite vista mar · octubre 2026</p></section>
    <footer class="site-footer"><div class="brand"><span class="monogram monogram--sm">M·S</span><span><strong>MARINA DEL SOL</strong><em>ALICANTE · COSTA BLANCA</em></span></div><nav><a style="color:inherit">Habitaciones</a><a style="color:inherit">Experiencias</a><a style="color:inherit">Reventa</a><a style="color:inherit">Contacto</a></nav><span class="legal">© 2026 Hotel Marina del Sol · ES · EN · RU</span></footer>
  </div>
</div>`;
}

function renderPhones(p) {
  const imgA = `${IMG}101-Simple-2026-09-28-1.jpg`;
  const imgB = `${IMG}201-Suite-2026-09-28-1.jpg`;
  const names = p.id === "A" ? { greet: "Buenos días, Marta", room: "Suite 201" } : { greet: "Buenas tardes, Marta", room: "Suite 201" };
  return `<div class="phones">
  <div class="phone"><div class="screen">
    <div class="sbar"><span>9:41</span><span>▪▪▪ ▮</span></div>
    <div class="app-nav"><button class="iconbtn" aria-label="Menú">☰</button><span class="wordmark-sm">MARINA DEL SOL</span><button class="iconbtn" aria-label="Cuenta">○</button></div>
    <div class="scr">
      <div class="mhero" style="background-image:url('${imgB}')"><div class="mhero-copy"><p class="eyebrow eyebrow--light">Alicante · Costa Blanca</p><h2>${p.id === "A" ? "El mar entra<br><em>en la habitación.</em>" : "Despierta<br><em>mirando al mar.</em>"}</h2></div></div>
      <div class="mbooking">
        <div class="b-field"><span>Entrada</span><strong>12 oct</strong></div>
        <div class="b-field"><span>Salida</span><strong>15 oct</strong></div>
        <button class="btn btn-primary">Ver disponibilidad</button>
      </div>
      <div class="mlist"><p class="eyebrow">Habitaciones</p>
        <div class="mrow"><img src="${imgA}" alt="Doble con terraza"><div><strong>Doble con terraza</strong><span>2 personas · 22 m²</span></div><b>92 €</b></div>
        <div class="mrow"><img src="${imgB}" alt="Suite vista mar"><div><strong>Suite vista mar</strong><span>3 personas · 38 m²</span></div><b>148 €</b></div>
        <div class="mrow"><img src="${IMG}116-Doble-2026-09-28-1.jpg" alt="Doble familiar"><div><strong>Doble familiar</strong><span>4 personas · 30 m²</span></div><b>118 €</b></div>
      </div>
    </div>
    <div class="tabbar"><span class="is-active"><i>⌂</i>Inicio</span><span><i>◫</i>Noches</span><span><i>◌</i>Asistente</span><span><i>☰</i>Cuenta</span></div>
  </div></div>

  <div class="phone"><div class="screen">
    <div class="sbar"><span>9:41</span><span>▪▪▪ ▮</span></div>
    <div class="app-head"><div><h3>Mis noches</h3><span>${names.greet} · 12 oct</span></div><span class="avatar">MR</span></div>
    <div class="app-body">
      <div class="ticket">
        <div class="ticket-qr" style="color:var(--ink)">${qrSvg(92)}</div>
        <div class="ticket-info"><p class="overline">Pase de la noche</p><h3>${names.room}</h3><p>12 – 15 oct · 3 noches<br>Reserva MD-2412 · 2 huéspedes</p><span class="ticket-chip">Check-in disponible</span></div>
      </div>
      <div class="pill-row"><span class="pill pill--ok">Noche en tu cartera</span><span class="pill">Reventa activa</span></div>
      <div class="actions-row"><button class="btn btn-primary">Mostrar pase</button><button class="btn btn-secondary">Vender noche</button></div>
      <div class="room-row" style="margin-top:2px"><span class="status-dot"></span><div class="who"><strong>Desayuno incluido</strong>07:30 – 11:00 · terraza</div><button class="btn btn-ghost">Ver</button></div>
      <div class="room-row"><span class="status-dot" style="background:var(--azure)"></span><div class="who"><strong>Conserjería</strong>Abierta 24 h · chatea con el asistente</div><button class="btn btn-ghost">Abrir</button></div>
      <div class="room-row"><span class="status-dot" style="background:var(--amber)"></span><div class="who"><strong>Cargos de la estancia</strong>Sin cargos pendientes · 0,00 €</div><button class="btn btn-ghost">Ver</button></div>
    </div>
    <div class="tabbar"><span><i>⌂</i>Inicio</span><span class="is-active"><i>◫</i>Noches</span><span><i>◌</i>Asistente</span><span><i>☰</i>Cuenta</span></div>
  </div></div>

  <div class="phone"><div class="screen">
    <div class="sbar"><span>7:42</span><span>▪▪▪ ▮</span></div>
    <div class="app-head"><div><h3>Housekeeping</h3><span>Turno mañana · 12 oct · 50 habitaciones</span></div><span class="avatar">AL</span></div>
    <div class="app-body">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-soft)"><span>Limpieza completada</span><b style="color:var(--ink)">32 / 50</b></div>
      <div class="progress"><i></i></div>
      <div class="pill-row"><span class="pill pill--ok">Libres 12</span><span class="pill pill--warn">Limpieza 6</span><span class="pill pill--err">Revisar 2</span></div>
      <div class="room-row"><span class="num">204</span><div class="who"><strong>Check-out 11:00</strong>2 huéspedes · salida</div><button class="btn btn-primary">Marcar limpia</button></div>
      <div class="room-row"><span class="num">305</span><div class="who"><strong>Limpiando</strong>Asignada a ti · 12 min</div><button class="btn btn-secondary">Terminar</button></div>
      <div class="room-row"><span class="num">210</span><div class="who"><strong>Revisar</strong>Aire acondicionado · incidencia</div><button class="btn btn-ghost">Detalle</button></div>
      <div class="empty" style="margin-top:2px"><b>Todo en orden</b>Sin incidencias nuevas en tu planta.</div>
    </div>
    <div class="tabbar"><span><i>◫</i>Tablero</span><span class="is-active"><i>▦</i>Habitaciones</span><span><i>✎</i>Parte</span><span><i>☰</i>Más</span></div>
  </div></div>
</div>`;
}

function renderAdmin(p) {
  const chartBars = [42, 55, 48, 62, 58, 74, 68, 81, 76, 88, 84, 92, 86, 96];
  const bars = chartBars
    .map((h, i) => `<div class="col"><div class="bar${i % 3 === 2 ? " bar--alt" : ""}" style="height:${h}%"></div></div>`)
    .join("");
  // Las 8 secciones reales del acordeón AdminLTE (`apps/web/src/components/admin/adminNav.ts`):
  // se conserva la arquitectura de información del producto, solo cambia la piel.
  const sections = [
    { icon: "▤", label: "Habitación", items: [["Habitaciones", false], ["Publicar noche", false], ["Subastas", false]] },
    { icon: "◔", label: "Recepción", items: [["Caducadas", false]] },
    { icon: "✦", label: "Housekeeping", items: [["Lencería", false]] },
    { icon: "◈", label: "Actividades", items: [["Actividades", false]] },
    { icon: "✚", label: "Mantenimiento", items: [["Incidencias", false], ["Preventivo", false]] },
    { icon: "◫", label: "Administración", open: true, items: [["Panel del día", true], ["Royalty", false], ["Fondos", false], ["Roles", false], ["Reseñas", false]] },
    { icon: "⚙", label: "Plataforma", items: [["Pausa", false], ["Contenido", false]] },
    { icon: "◍", label: "Sistemas", items: [["Contratos", false], ["Usuarios", false], ["Finanzas", false], ["Operaciones", false], ["Ajustes", false]] },
  ];
  const lock = '<span class="lock" aria-label="Requiere rol"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>';
  const side = sections
    .map((section) => {
      const header = `<div class="adm-item adm-section${section.open ? " is-open" : ""}${section.label === "Housekeeping" ? " is-hover" : ""}"><i aria-hidden="true">${section.icon}</i><span>${section.label}</span><span class="chev" aria-hidden="true">${section.open ? "⌄" : "›"}</span></div>`;
      if (!section.open) return header;
      return (
        header +
        `<div class="adm-sub">${section.items
          .map(
            ([label, active]) =>
              `<div class="adm-item${active ? " is-active" : ""}"><span>${label}</span>${label === "Fondos" || label === "Royalty" ? lock : ""}</div>`,
          )
          .join("")}</div>`
      );
    })
    .join("");
  return `<div class="admin-frame">
  <aside class="adm-side">
    <div class="adm-brand"><span class="monogram monogram--sm">M·S</span><span><strong>MARINA DEL SOL</strong><em>ADMINISTRACIÓN</em></span></div>
    ${side}
    <div class="adm-session"><b>A. Ruiz · Propietaria</b>DEFAULT_ADMIN · MINTER · TREASURER<br>Sesión verificada · TOTP</div>
  </aside>
  <div class="adm-main">
    <header class="adm-nav">
      <button class="iconbtn" aria-label="Abrir menú">☰</button>
      <div class="adm-search">⌕ Buscar reserva, huésped o token…</div>
      <div class="adm-nav-right"><span>? Ayuda</span><span>◔ Avisos</span><span class="avatar">AR</span></div>
    </header>
    <div class="adm-content">
      <div class="adm-head">
        <div><p class="crumbs">Inicio / Administración / Panel del día</p><h2>Panel del día</h2><p class="adm-sub">sábado, 12 de octubre · 07:42 · 50 habitaciones · ocupación 82 %</p></div>
        <div class="adm-actions"><button class="btn btn-secondary">Exportar</button><button class="btn btn-primary">Publicar noche</button></div>
      </div>
      <div class="adm-kpis">
        <div class="kpi"><span class="icon">◔</span><p class="label">Ocupación hoy</p><p class="value">82 %</p><span class="delta">▲ 4,2 pts</span></div>
        <div class="kpi"><span class="icon">◫</span><p class="label">Noches vendidas</p><p class="value">1.284</p><span class="delta">▲ 6,1 %</span></div>
        <div class="kpi"><span class="icon">€</span><p class="label">Ingresos del mes</p><p class="value">18.450 €</p><span class="delta">▲ 8,4 %</span></div>
        <div class="kpi"><span class="icon">✚</span><p class="label">Incidencias</p><p class="value">3</p><span class="delta down">▼ 2 abiertas</span></div>
      </div>
      <div class="adm-grid">
        <div class="card"><div class="card-head">Noches vendidas · últimos 14 días <span>objetivo 1.200</span></div><div class="chart">${bars}</div><div class="chart-legend"><span><i></i>Venta directa</span><span><i class="alt"></i>Reventa</span></div></div>
        <div class="card"><div class="card-head">Actividad reciente <span>en vivo</span></div><div class="timeline">
          <div class="tl"><span class="dot ok"></span><div><b>Noche acuñada · #1284</b><span>Suite 201 · 12 oct · hace 4 min</span></div></div>
          <div class="tl"><span class="dot"></span><div><b>Check-in completado</b><span>Habitación 104 · L. García · 07:38</span></div></div>
          <div class="tl"><span class="dot warn"></span><div><b>Incidencia abierta</b><span>Hab. 210 · climatización · 07:21</span></div></div>
          <div class="tl"><span class="dot ok"></span><div><b>Reventa publicada</b><span>Noche #1190 · 96 € · 07:15</span></div></div>
        </div></div>
      </div>
      <div class="adm-grid2">
        <div class="card"><div class="card-head">Reservas de hoy <span>ver todas →</span></div><table class="adm-table"><thead><tr><th>Hab.</th><th>Huésped</th><th>Estado</th><th>Hora</th><th>Importe</th></tr></thead><tbody>
          <tr><td>101</td><td>L. García</td><td><span class="status st-ok">Confirmada</span></td><td>14:00</td><td>276 €</td></tr>
          <tr><td>204</td><td>M. Rossi</td><td><span class="status st-info">Check-out</span></td><td>11:00</td><td>—</td></tr>
          <tr><td>305</td><td>J. Pérez</td><td><span class="status st-warn">Limpieza</span></td><td>15:30</td><td>148 €</td></tr>
          <tr><td>210</td><td>A. Novak</td><td><span class="status st-err">Incidencia</span></td><td>16:00</td><td>92 €</td></tr>
        </tbody></table></div>
        <div class="card"><div class="card-head">Preventivo de esta semana <span>4 tareas</span></div><div class="adm-list">
          <div class="adm-list-row"><span class="status st-info">Hoy</span> Revisión ascensor <b>1</b></div>
          <div class="adm-list-row"><span class="status st-warn">Mañana</span> Climatización 2ª planta <b>6</b></div>
          <div class="adm-list-row"><span class="status st-ok">Vie</span> Piscina · análisis agua <b>—</b></div>
          <div class="adm-list-row"><span class="status st-info">Sáb</span> Lencería · inventario <b>2</b></div>
        </div></div>
      </div>
      <p class="adm-footnote">Datos de demostración · la identidad no altera la lógica ni las cifras reales del panel</p>
    </div>
  </div>
</div>
<div class="phones" style="margin-top:18px">
  <div class="phone" style="width:340px;height:600px"><div class="screen">
    <div class="sbar"><span>7:42</span><span>▪▪▪ ▮</span></div>
    <div class="adm-nav" style="height:52px;padding:0 12px"><button class="iconbtn" style="width:34px;height:34px">☰</button><strong style="font-size:12px">Panel del día</strong><span class="avatar" style="margin-left:auto">AR</span></div>
    <div style="padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--adm-page);flex:1">
      <div class="adm-kpis" style="grid-template-columns:1fr 1fr;gap:8px">
        <div class="kpi" style="padding:11px"><p class="label">Ocupación</p><p class="value" style="font-size:23px">82 %</p><span class="delta">▲ 4,2</span></div>
        <div class="kpi" style="padding:11px"><p class="label">Ingresos</p><p class="value" style="font-size:23px">18.450 €</p><span class="delta">▲ 8,4 %</span></div>
      </div>
      <div class="card" style="padding:0"><div class="card-head" style="font-size:12px">Reservas de hoy</div><table class="adm-table"><tbody><tr><td>101 · L. García</td><td><span class="status st-ok">Confirmada</span></td></tr><tr><td>204 · M. Rossi</td><td><span class="status st-info">Check-out</span></td></tr><tr><td>305 · J. Pérez</td><td><span class="status st-warn">Limpieza</span></td></tr></tbody></table></div>
      <button class="btn btn-primary" style="min-height:44px">Publicar noche</button>
    </div>
  </div></div>
  <p class="note" style="max-width:330px;align-self:center">En móvil, el shell AdminLTE pasa a <strong>cajón lateral</strong> con velo, la barra superior queda fija y los KPI se apilan en dos columnas. Las tablas densas se convierten en filas-tarjeta sin sacar columnas del DOM.</p>
</div>`;
}

function renderComponents(p) {
  return `<div class="comp-grid">
  <div class="card comp"><p class="overline">Botones y foco</p><div class="stack">
    <div class="btn-row"><button class="btn btn-primary">Publicar noche</button><button class="btn btn-secondary">Exportar</button></div>
    <div class="btn-row"><button class="btn btn-ghost">Ver detalle</button><button class="btn btn-danger">Cancelar</button><button class="btn btn-disabled" disabled>Sin saldo</button></div>
    <span class="focus-demo">Foco visible · doble anillo</span>
    <p class="help" style="font-size:10px;color:var(--ink-soft)">Área táctil mínima 44×44 px · foco ≥3:1 contra los colores adyacentes.</p>
  </div></div>
  <div class="card comp"><p class="overline">Campos de formulario</p><div class="stack">
    <div class="field"><label for="f1">Correo del huésped</label><input id="f1" value="marta@ejemplo.es"></div>
    <div class="field"><label for="f2">Número de huéspedes</label><select id="f2"><option>2 personas</option></select><p class="help">La frontera del control usa <b>line-strong</b> (≥3:1).</p></div>
    <div class="field error"><label for="f3">Código de reserva</label><input id="f3" value="MD-24"><p class="help" role="alert">Faltan 2 caracteres. Revisa el resguardo.</p></div>
  </div></div>
  <div class="card comp"><p class="overline">Etiquetas y estados</p><div class="stack">
    <div class="badges"><span class="badge badge--suite">Suite</span><span class="badge badge--resale">Reventa</span><span class="badge badge--free">Disponible</span><span class="badge">Ocupada</span><span class="badge badge--error">Incidencia</span></div>
    <div class="pill-row" style="margin-top:4px"><span class="pill pill--ok">Confirmada</span><span class="pill pill--warn">Limpieza</span><span class="pill pill--err">Bloqueada</span><span class="pill">En revisión</span></div>
    <p class="help" style="font-size:10px;color:var(--ink-soft)">El color nunca es el único canal: cada estado lleva texto y, en tablas, símbolo.</p>
  </div></div>
  <div class="card comp"><p class="overline">Tabla densa (DataTable)</p><table class="mini-table"><thead><tr><th>Hab.</th><th>Estado</th><th>Huésped</th></tr></thead><tbody><tr><td>101</td><td>Disponible</td><td>—</td></tr><tr><td>204</td><td>Salida 11:00</td><td>M. Rossi</td></tr><tr><td>305</td><td>Limpieza</td><td>J. Pérez</td></tr></tbody></table><p class="help" style="font-size:10px;color:var(--ink-soft);margin-top:8px">Cabecera fija, filas de 44 px y columnas ocultables sin salir del DOM.</p></div>
  <div class="card comp"><p class="overline">Vacío y degradado</p><div class="stack">
    <div class="empty"><b>No hay incidencias</b>Todo en orden en tu planta.</div>
    <div class="empty" style="background:var(--warning-bg);border-color:var(--warning)"><b>No pudimos comprobar la cadena</b>El RPC no responde. Reintenta en unos segundos.</div>
  </div></div>
  <div class="card comp"><p class="overline">Paleta en contexto</p><div class="stack">
    <div class="swatches-mini">${["mist", "mist-2", "shell", "arena", "ink", "ink-soft", "azure", "azure-deep", "navy", "pearl", "coral", "amber", "fern"].filter((t) => p.palette[t]).map((t) => `<i style="background:var(--${t})" title="${t} ${p.palette[t]}"></i>`).join("")}</div>
    <p class="help" style="font-size:10px;color:var(--ink-soft)">Un solo origen de verdad: los mismos valores se consumen en web, en el back-office AdminLTE y en el tema Compose de la APK.</p>
    <button class="btn btn-secondary" style="margin-top:2px">Sincronizar tokens</button>
  </div></div>
</div>`;
}

function renderContrast(p, audit) {
  const approved = audit.approved
    .slice(0, 12)
    .map(
      (r) => `<tr><td><span class="pair"><i style="background:${r.fg}"></i><i style="background:${r.bg}"></i></span></td><td>${r.where}</td><td class="${r.value >= r.min ? "ok" : "ko"}">${fmt(r.value)}:1</td><td>${r.min < 4.5 ? "≥3:1" : r.value >= 7 ? "AAA" : "AA"}</td></tr>`,
    )
    .join("");
  const veilRows = audit.veils
    .map(
      (v) => `<tr><td><span class="pair"><i style="background:${v.fgHex}"></i><i style="background:${v.bgHex}"></i></span></td><td>${v.where}</td><td class="ok">${fmt(v.value)}:1</td><td>AA</td></tr>`,
    )
    .join("");
  const prohibited = audit.prohibited
    .map(
      (r) => `<tr><td><span class="pair"><i style="background:${r.fgHex}"></i><i style="background:${r.bgHex}"></i></span></td><td>${r.where}</td><td class="ko">${fmt(r.value)}:1</td><td>${r.why}</td></tr>`,
    )
    .join("");
  return `<div class="summary">
  <div class="sum"><b>${audit.approved.length + audit.veils.length}</b><span>pares texto/fondo medidos con WCAG 2.1</span></div>
  <div class="sum"><b>${audit.failures.length === 0 ? "0" : audit.failures.length}</b><span>pares por debajo de su mínimo</span></div>
  <div class="sum"><b>${fmt(Math.min(...audit.approved.map((r) => r.value)))}:1</b><span>ratio mínimo declarado (fronteras de control)</span></div>
</div>
<div class="contrast">
  <div class="card" style="overflow:hidden"><table class="ctable"><thead><tr><th></th><th>Par texto / fondo</th><th>Ratio</th><th>Nivel</th></tr></thead><tbody>${approved}${veilRows}</tbody></table></div>
  <div class="card" style="overflow:hidden"><table class="ctable"><thead><tr><th></th><th>Par prohibido</th><th>Ratio</th><th>Motivo</th></tr></thead><tbody>${prohibited}</tbody></table></div>
</div>
<p class="note" style="margin-top:12px;max-width:none">Tabla completa (${audit.approved.length + audit.veils.length} pares aprobados y ${audit.prohibited.length} prohibidos) en <a href="../contraste-${p.slug}.md"><code>contraste-${p.slug}.md</code></a>. Verificación: <code>node scripts/design/proposals-v3.mjs</code> — el script falla si algún par incumple.</p>`;
}

function renderPreview(p, audit) {
  const recommended = p.id === "A" ? `<span class="tag">Recomendada</span>` : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Propuesta ${p.id} · ${p.name} — identidad visual Hotel Marina del Sol</title>
<style>${buildCss(p)}</style>
</head>
<body>
<div class="doc">
  <header class="top">
    <div>
      <p class="eyebrow">@visualUiUx · identidad visual v3 · propuesta ${p.id}</p>
      <h1 class="hero-title">${p.name.replace("&", "&amp;")}${recommended}</h1>
      <p class="tagline">${p.tagline}</p>
    </div>
    <div class="chips">
      <span class="chip chip--ok">✅ WCAG 2.1 AA medido</span>
      <span class="chip">${p.admin.mode}</span>
      <span class="chip">Web · Móvil · APK</span>
    </div>
  </header>
  <p class="lede"><strong>${p.personality.join(" · ")}.</strong> ${p.concept}</p>
  ${miniStrip(p)}
  <nav class="toc" aria-label="Índice de la propuesta">
    <a href="#paleta">01 Color</a><a href="#tipografia">02 Tipografía</a><a href="#web">03 Web</a><a href="#movil">04 Móvil · APK</a><a href="#admin">05 AdminLTE</a><a href="#componentes">06 Componentes</a><a href="#contraste">07 Contraste</a>
  </nav>

  <section class="block" id="paleta">
    ${sectionHead("01", "Color", "Paleta por rol semántico", "Muestra, HEX, HSL y el ratio del par texto/fondo con el que se usa. Todos los pares declarados se miden; si uno no llega a AA, esta propuesta no se publica.")}
    ${renderSwatches(p, audit)}
  </section>

  <section class="block" id="tipografia">
    ${sectionHead("02", "Tipografía y marca", "Escala modular, fuentes y lockup", `${p.fonts.display.family} para la voz editorial y ${p.fonts.ui.family} para la interfaz. Ambas publican cirílico: el locale RU se pinta con las fuentes de marca.`)}
    ${renderTypography(p)}
    ${renderBrand(p)}
  </section>

  <section class="block" id="web">
    ${sectionHead("03", "Web", "Landing pública", "Hero a sangre con velo al 70 % (medido), barra de reserva flotante, tarjetas de habitación y narrativa editorial. Mobile-first a 320 px.")}
    ${renderLanding(p)}
  </section>

  <section class="block" id="movil">
    ${sectionHead("04", "Móvil y APK", "El mismo token en tres pantallas", "Web móvil, app del huésped (Compose) y suite de housekeeping. Mismos roles de color, área táctil ≥44 px (48 dp en Android).")}
    ${renderPhones(p)}
  </section>

  <section class="block" id="admin">
    ${sectionHead("05", "AdminLTE", p.adminSkin === "light" ? "Back-office · light skin «salón de luz»" : "Back-office · dark skin «sala de máquinas»", "Misma distribución AdminLTE de siempre —sidebar plegable, navbar, migas, content-wrapper y small-box— con la identidad nueva. El shell no se reescribe: se re-viste.")}
    ${renderAdmin(p)}
  </section>

  <section class="block" id="componentes">
    ${sectionHead("06", "Componentes", "Inventario atómico en contexto", "Átomos, moléculas y organismos con sus estados: hover, foco, disabled, error, vacío y degradado honesto.")}
    ${renderComponents(p)}
  </section>

  <section class="block" id="contraste">
    ${sectionHead("07", "Accesibilidad", "Contraste medido, no estimado", "Matemática WCAG 2.1 sin redondear. Los pares prohibidos se incluyen como comprobación negativa: confirman que el límite está medido y no es una opinión.")}
    ${renderContrast(p, audit)}
  </section>

  <footer class="foot">
    <span>Propuesta ${p.id} · <b>${p.name}</b> · generada por <code>scripts/design/proposals-v3.mjs</code></span>
    <span>Hotel Marina del Sol · Alicante · 2026-10 · tokens listos para <code>packages/config/tailwind/preset.cjs</code></span>
  </footer>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens JSON + preset candidato de Tailwind + tablas markdown
// ─────────────────────────────────────────────────────────────────────────────
function writeTokens(p) {
  const colors = {};
  for (const r of p.roles) colors[r.role] = { $type: "color", $value: p.palette[r.token], $description: `${r.use} (token de código: ${r.token})` };
  const tokens = {
    $description: `Propuesta ${p.id} «${p.name}» — identidad visual v3 del Hotel Marina del Sol (2026-10). Candidata, no aplicada.`,
    name: `${p.name} (propuesta ${p.id})`,
    version: "3.0.0-candidate",
    color: colors,
    typography: {
      display: { $type: "fontFamily", $value: p.fonts.display.stack },
      sans: { $type: "fontFamily", $value: p.fonts.ui.stack },
      scale: Object.fromEntries(
        p.typeScale.map((t) => [t.key, { $type: "typography", $value: { fontSize: t.clamp, fontWeight: t.weight, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing } }]),
      ),
    },
    radius: Object.fromEntries(Object.entries(p.radii).map(([k, v]) => [k, { $type: "dimension", $value: `${v}px` }])),
    shadow: Object.fromEntries(Object.entries(p.shadows).map(([k, v]) => [k, { $type: "shadow", $value: v }])),
    space: Object.fromEntries(
      [4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64, 96].map((v) => [String(v), { $type: "dimension", $value: `${v}px` }]),
    ),
    breakpoint: {
      tablet: { $type: "dimension", $value: "768px" },
      desktop: { $type: "dimension", $value: "1024px" },
      wide: { $type: "dimension", $value: "1440px" },
    },
  };
  writeFileSync(join(TOKENS, `design-tokens-${p.slug}.json`), JSON.stringify(tokens, null, 2) + "\n");
}

function readCurrentPreset() {
  const require = createRequire(import.meta.url);
  return { preset: require(join(ROOT, "packages/config/tailwind/preset.cjs")), require };
}

function writeCandidatePreset(p) {
  const { preset } = readCurrentPreset();
  const clone = JSON.parse(JSON.stringify(preset));
  const colors = {};
  for (const [key, value] of Object.entries(clone.theme.extend.colors)) {
    colors[key] = p.palette[key] ?? value;
  }
  const newToken = p.newToken;
  if (newToken && p.palette[newToken] && !(newToken in colors)) {
    const entries = Object.entries(colors);
    const anchor = entries.findIndex(([key]) => key === "shell");
    entries.splice(anchor + 1, 0, [newToken, p.palette[newToken]]);
    clone.theme.extend.colors = Object.fromEntries(entries);
  } else {
    clone.theme.extend.colors = colors;
  }
  clone.theme.extend.fontFamily = {
    display: ["var(--font-display)", ...p.fonts.display.stack.split(",").slice(1).map((s) => s.trim())],
    sans: ["var(--font-sans)", ...p.fonts.ui.stack.split(",").slice(1).map((s) => s.trim())],
  };
  clone.theme.extend.fontSize = Object.fromEntries(
    p.typeScale.map((t) => [t.key, [t.clamp, { lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, fontWeight: t.weight }]]),
  );
  clone.theme.extend.borderRadius = {
    "brand-xs": `${p.radii["brand-xs"]}px`,
    brand: `${p.radii.brand}px`,
    "brand-sm": `${p.radii["brand-sm"]}px`,
    "brand-lg": `${p.radii["brand-lg"]}px`,
    pill: `${p.radii.pill}px`,
  };
  clone.theme.extend.boxShadow = { card: p.shadows.card, "card-hover": p.shadows["card-hover"], modal: p.shadows.modal };
  const header = `/**
 * CANDIDATO — preset de Tailwind para la propuesta ${p.id} «${p.name}».
 *
 * NO se importa en paralelo al preset real: si esta propuesta se elige, estos valores SUSTITUYEN
 * los de \`packages/config/tailwind/preset.cjs\` (mismo nombre de token, valor nuevo + ${p.newToken}).
 * Generado por \`scripts/design/proposals-v3.mjs\`; los comentarios del preset original se pierden
 * a propósito en este candidato. La fuente de verdad de la propuesta es
 * \`RepoTecnico/propuestas_v3_identidad/\`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = `;
  writeFileSync(join(TOKENS, `tailwind-preset-${p.slug}.cjs`), header + JSON.stringify(clone, null, 2) + ";\n");
}

function writeAndroidTheme(p) {
  const hex = (token) => p.palette[token].replace("#", "").toUpperCase();
  const c = (token) => `Color(0xFF${hex(token)})`;
  const body = `package com.marinadelsol.app.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * Tema Compose de la propuesta ${p.id} «${p.name}» — BORRADOR para el ciclo A1.4 del plan de la APK
 * (\`apps/mobile\` aún no existe). Paridad 1:1 con los tokens de \`packages/config/tailwind/preset.cjs\`:
 * el mismo rol semántico tiene el mismo valor en web, AdminLTE y Android.
 *
 * Reglas:
 *  · NO se usa Material You dinámico: la marca no se sustituye por el color del fondo de pantalla.
 *  · Área táctil mínima 48 dp (Android) — el mínimo web de 44 px queda por debajo.
 *  · Tipografía: body 16 sp mínimo; display/titulares con la familia ${p.fonts.display.family}.
 *  · Modo noche del personal: PROPUESTO Y NO APROBADO (fuera de esta entrega).
 *
 * Generado por \`scripts/design/proposals-v3.mjs\`. Candidato, no aplicado.
 */
object MarinaColors {
    val mist = ${c("mist")}
    val mist2 = ${c("mist-2")}
    val shell = ${c("shell")}
${p.palette.arena ? `    val arena = ${c("arena")}\n` : ""}    val ink = ${c("ink")}
    val inkSoft = ${c("ink-soft")}
    val azure = ${c("azure")}
    val azureDeep = ${c("azure-deep")}
${p.palette.agua ? `    val agua = ${c("agua")}\n` : ""}    val navy = ${c("navy")}
    val navySoft = ${c("navy-soft")}
    val pearl = ${c("pearl")}
    val coral = ${c("coral")}
    val coralText = ${c("coral-text")}
    val amber = ${c("amber")}
    val fern = ${c("fern")}
    val line = ${c("line")}
    val lineStrong = ${c("line-strong")}
    val success = ${c("success")}
    val successBg = ${c("success-bg")}
    val warning = ${c("warning")}
    val warningBg = ${c("warning-bg")}
    val error = ${c("error")}
    val errorBg = ${c("error-bg")}
    val info = ${c("info")}
    val infoBg = ${c("info-bg")}
}

val MarinaLightScheme: ColorScheme = lightColorScheme(
    primary = MarinaColors.azure,
    onPrimary = MarinaColors.shell,
    primaryContainer = MarinaColors.mist2,
    onPrimaryContainer = MarinaColors.azureDeep,
    secondary = MarinaColors.coral,
    onSecondary = MarinaColors.shell,
    secondaryContainer = MarinaColors.warningBg,
    onSecondaryContainer = MarinaColors.coralText,
    tertiary = MarinaColors.fern,
    onTertiary = MarinaColors.shell,
    tertiaryContainer = MarinaColors.successBg,
    onTertiaryContainer = MarinaColors.success,
    background = MarinaColors.mist,
    onBackground = MarinaColors.ink,
    surface = MarinaColors.shell,
    onSurface = MarinaColors.ink,
    surfaceVariant = MarinaColors.mist2,
    onSurfaceVariant = MarinaColors.inkSoft,
    outline = MarinaColors.lineStrong,
    outlineVariant = MarinaColors.line,
    error = MarinaColors.error,
    onError = MarinaColors.shell,
    errorContainer = MarinaColors.errorBg,
    onErrorContainer = MarinaColors.error,
    inverseSurface = MarinaColors.navy,
    inverseOnSurface = MarinaColors.mist,
    inversePrimary = MarinaColors.pearl,
)
`;
  writeFileSync(join(TOKENS, `android-theme-${p.slug}.kt`), body);
}

function writeContrastMd(p, audit) {
  const rows = (list) =>
    list
      .map(
        (r) =>
          `| \`${r.fgToken}\` ${r.fg} | \`${r.bgToken}\` ${r.bg} | **${fmt(r.value)}:1** | ${r.min}:1 | ${r.value >= r.min ? (r.value >= 7 ? "AAA ✅" : "AA ✅") : "NO CUMPLE ❌"} | ${r.where} |`,
      )
      .join("\n");
  const veilRows = audit.veils
    .map((v) => `| \`${v.fg}\` ${v.fgHex} | velo al ${Math.round(v.alpha * 100)} % sobre ${v.base} → ${v.bgHex} | **${fmt(v.value)}:1** | 4.5:1 | ${v.value >= 4.5 ? "AA ✅" : "NO CUMPLE ❌"} | ${v.where} |`)
    .join("\n");
  const prohibited = audit.prohibited
    .map((r) => `| \`${r.fg}\` ${r.fgHex} | \`${r.bg}\` ${r.bgHex} | **${fmt(r.value)}:1** | — | ❌ prohibido | ${r.why} |`)
    .join("\n");
  const md = `# Contraste WCAG 2.1 — Propuesta ${p.id} «${p.name}»

> **Generado** por \`scripts/design/proposals-v3.mjs\` (misma matemática que
> \`apps/web/src/lib/a11y/contrast.ts\`: luminancia relativa + ratio sin redondear).
> **Fecha**: 2026-10 · **Pares aprobados**: ${audit.approved.length + audit.veils.length} ·
> **Fallos**: ${audit.failures.length} · **Pares prohibidos documentados**: ${audit.prohibited.length}.
> Si un par no alcanza su mínimo, el generador **falla y no publica** la propuesta.

## Pares aprobados (texto sobre fondo)

| Texto | Fondo | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
${rows(audit.approved)}

## Velos compuestos

| Texto | Fondo compuesto | Ratio | Mínimo | Veredicto | Dónde se usa |
|---|---|---|---|---|---|
${veilRows}

## Pares prohibidos (comprobación negativa)

| Texto | Fondo | Ratio | — | Veredicto | Motivo |
|---|---|---|---|---|---|
${prohibited}

## Notas de medición

- **Fronteras de control** (\`line-strong\`): el mínimo aplicable es **3:1** (WCAG 1.4.11), no 4,5:1.
- **Texto deshabilitado**: exento por WCAG 2.1 · 1.4.3 (componentes inactivos).
- **Velos**: se compone el color al alfa declarado sobre \`shell\`; la fotografía real se mide en la
  previsualización con el mismo compuesto (el generador usa el valor del velo, no una estimación).
- El detalle premium \`pearl\` solo se declara sobre superficies oscuras; \`amber\` es una
  **superficie** (no un texto) en ambas propuestas.
`;
  writeFileSync(join(OUT, `contraste-${p.slug}.md`), md);
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativa + índice
// ─────────────────────────────────────────────────────────────────────────────
function renderCompare() {
  const cards = PROPOSALS.map((p) => {
    const d = auditProposal(p);
    return `<article class="cmp-card" style="font-family:${p.fonts.ui.stack}">
      <header><p class="eyebrow">Propuesta ${p.id}</p><h2 style="font-family:${p.fonts.display.stack}">${p.name}</h2><p class="tagline" style="font-family:${p.fonts.display.stack}">${p.tagline}</p><div class="chips">${p.id === "A" ? '<span class="chip chip--tag">Recomendada</span>' : ""}<span class="chip">${p.admin.mode}</span><span class="chip">${p.fonts.display.family} + ${p.fonts.ui.family}</span></div></header>
      <img class="shot" src="../capturas/${p.slug}-hero.png" alt="Hero de la landing con la propuesta ${p.id}">
      <div class="strip">${p.roles.map((r) => `<span style="background:${p.palette[r.token]}" title="${r.role}"></span>`).join("")}</div>
      <p class="concept">${p.concept}</p>
      <ul>
        <li><b>${d.approved.length + d.veils.length}</b> pares WCAG medidos · <b>${d.failures.length}</b> fallos</li>
        <li>AdminLTE: <b>${p.adminSkin === "light" ? "light skin (cambia el sidebar)" : "dark skin (solo valores)"}</b></li>
        <li>Migración: ${p.migration.effort}</li>
      </ul>
      <a class="go" href="./${p.slug}.html">Abrir previsualización completa →</a>
    </article>`;
  }).join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dos identidades para Hotel Marina del Sol</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=${PROPOSALS[0].fonts.display.google}&family=${PROPOSALS[0].fonts.ui.google}&family=${PROPOSALS[1].fonts.display.google}&family=${PROPOSALS[1].fonts.ui.google}&display=swap');
*{box-sizing:border-box}
body{margin:0;background:#F6F1E7;color:#15222C;font-family:${PROPOSALS[0].fonts.ui.stack};padding:40px 28px 64px}
h1{font-family:${PROPOSALS[0].fonts.display.stack};font-size:52px;line-height:1;letter-spacing:-.02em;margin:6px 0 8px;max-width:1000px}
.lede{max-width:86ch;color:#4A5560;font-size:17px;line-height:1.55;margin:0}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#A34A22;margin:0}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:34px}
.cmp-card{background:#fff;border:1px solid #E3D8C4;border-radius:22px;padding:22px;box-shadow:0 10px 30px rgba(20,35,45,.08)}
.cmp-card h2{font-family:${PROPOSALS[1].fonts.display.stack};font-size:38px;line-height:1;margin:8px 0 2px}
.tagline{font-family:${PROPOSALS[1].fonts.display.stack};font-style:italic;color:#4A5560;font-size:19px;margin:0 0 14px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.chip{font-size:10.5px;font-weight:700;border:1px solid #CFC3AE;border-radius:999px;padding:4px 10px;background:#fff}
.chip--tag{background:#AE4E2A;border-color:#AE4E2A;color:#fff}
.shot{width:100%;height:270px;object-fit:cover;object-position:center;border-radius:14px;border:1px solid #E3D8C4}
.strip{display:flex;margin-top:12px;height:34px;border-radius:9px;overflow:hidden;border:1px solid #E3D8C4}
.strip span{flex:1}
.concept{font-size:13px;line-height:1.55;color:#4A5560;margin:14px 0 10px}
.cmp-card ul{margin:0 0 16px;padding-left:18px;font-size:12.5px;line-height:1.7;color:#37454F}
.cmp-card li b{color:#15222C}
.go{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:10px;background:#15222C;color:#fff;text-decoration:none;font-size:13px;font-weight:700}
.note{margin-top:26px;font-size:12px;color:#4A5560;max-width:90ch}
</style></head>
<body>
<p class="eyebrow">Hotel Marina del Sol · identidad visual v3</p>
<h1>Dos Mediterráneos. Una decisión.</h1>
<p class="lede">La misma arquitectura AdminLTE, la misma accesibilidad medida y los mismos tokens de código; dos formas de contar el hotel. Abre cada previsualización para ver la landing, la web móvil, la APK y el back-office con datos de demostración.</p>
<section class="cmp">${cards}</section>
<p class="note">Las capturas se generan desde el HTML real con Chromium (Playwright), no son mockups de Figma: lo que se ve es lo que se implementaría con los tokens de <code>RepoTecnico/propuestas_v3_identidad/tokens/</code>.</p>
</body></html>`;
}

function renderIndex() {
  const links = PROPOSALS.map(
    (p) => `<li><a href="./${p.slug}.html"><b>Propuesta ${p.id} — ${p.name}</b><span>${p.tagline}</span></a></li>`,
  ).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Propuestas de identidad visual v3</title>
<style>body{margin:0;padding:48px 28px;font-family:system-ui,sans-serif;background:#F6F1E7;color:#15222C}h1{font-family:Georgia,serif;font-size:40px;margin:0 0 8px}p{color:#4A5560;max-width:70ch;line-height:1.55}ul{list-style:none;padding:0;margin:28px 0;display:grid;gap:14px;max-width:760px}li a{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #E3D8C4;border-radius:16px;padding:18px 20px;text-decoration:none;color:inherit}li a:hover{border-color:#AE4E2A}li b{font-size:18px}li span{font-size:13px;color:#4A5560}a{color:#0B5C74}</style></head>
<body><h1>Propuestas de identidad visual v3</h1><p>Hotel Marina del Sol · 2026-10 · generadas por <code>scripts/design/proposals-v3.mjs</code>. Cada propuesta incluye landing, móvil/APK, AdminLTE, componentes y la tabla de contraste medida.</p>
<ul>${links}<li><a href="./comparativa.html"><b>Comparativa lado a lado</b><span>Paletas, capturas de hero y criterios de decisión</span></a></li></ul>
<p>Artefactos de decisión: <a href="../README.md">README de la carpeta</a> · <a href="../contraste-${PROPOSALS[0].slug}.md">contraste A</a> · <a href="../contraste-${PROPOSALS[1].slug}.md">contraste B</a></p>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capturas con Chromium (Playwright del workspace web)
// ─────────────────────────────────────────────────────────────────────────────
const EXTRA_LIBS = ["/home/dsh/tools/libs/usr/lib/x86_64-linux-gnu", "/tmp/chromium-libs/root/usr/lib/x86_64-linux-gnu"].filter((d) => existsSync(d));
if (EXTRA_LIBS.length > 0) {
  process.env.LD_LIBRARY_PATH = [...EXTRA_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
}

async function captureAll(p) {
  const require = createRequire(join(ROOT, "apps", "web", "package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const url = `file://${join(PREV, `${p.slug}.html`)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            }),
      ),
    );
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(CAPS, `${p.slug}-completa.png`), fullPage: true });
  // El índice es `position: sticky`: al capturar un elemento suelto se pinta sobre la sección.
  // Para las capturas de sección se oculta (en el navegador real sigue funcionando).
  await page.addStyleTag({ content: ".toc{display:none!important}" });
  const clips = [
    ["#web .frame", `${p.slug}-landing.png`],
    ["#web .hero", `${p.slug}-hero.png`],
    ["#movil .phones", `${p.slug}-movil.png`],
    ["#admin .admin-frame", `${p.slug}-admin.png`],
  ];
  for (const [selector, file] of clips) {
    const el = await page.$(selector);
    if (el) await el.screenshot({ path: join(CAPS, file) });
  }
  await browser.close();
}

async function captureFile(fileName, outName, viewport = { width: 1440, height: 1000 }) {
  const require = createRequire(join(ROOT, "apps", "web", "package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`file://${join(PREV, fileName)}`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(CAPS, outName), fullPage: true });
  await browser.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────────────────────
const results = [];
for (const p of PROPOSALS) {
  const audit = auditProposal(p);
  if (audit.failures.length > 0) {
    console.error(`\n❌ Propuesta ${p.id} «${p.name}»: pares por debajo del mínimo`);
    for (const f of audit.failures) console.error(`   ${f.fgToken} sobre ${f.bgToken}: ${fmt(f.value)} < ${f.reason} (${f.where})`);
    process.exit(1);
  }
  writeTokens(p);
  writeCandidatePreset(p);
  writeAndroidTheme(p);
  writeContrastMd(p, audit);
  const html = renderPreview(p, audit);
  writeFileSync(join(PREV, `${p.slug}.html`), html);
  results.push({ p, audit });
  console.log(`✅ Propuesta ${p.id} «${p.name}»: ${audit.approved.length + audit.veils.length} pares medidos, ${audit.failures.length} fallos, ${audit.prohibited.length} prohibidos documentados.`);
}

writeFileSync(join(PREV, "comparativa.html"), renderCompare());
writeFileSync(join(PREV, "index.html"), renderIndex());

if (!NO_PNG) {
  for (const { p } of results) {
    console.log(`📸 Capturando ${p.name}…`);
    await captureAll(p);
  }
  console.log("📸 Capturando comparativa…");
  await captureFile("comparativa.html", "comparativa.png");
}

console.log("\nArtefactos generados en RepoTecnico/propuestas_v3_identidad/:");
console.log(`  previsualizaciones/ (2 propuestas + comparativa + índice)`);
console.log(`  capturas/ (PNG de página completa, landing, hero, móvil, admin${NO_PNG ? " — omitido por --no-png" : ""})`);
console.log(`  tokens/ (design-tokens + preset candidato de Tailwind)`);
console.log(`  contraste-propuesta-*.md (tablas WCAG completas)`);
console.log("\nAbre previsualizaciones/index.html para ver las propuestas.");
