#!/usr/bin/env node
/**
 * Genera `apps/web/src/app/admin-surface.css`: la piel **«Posidonia» (B)** de la suite
 * administrativa, aplicada dentro del scope `.admin-surface`.
 *
 * Por qué así y no con dos presets de Tailwind: el proyecto tiene un único preset y una batería de
 * guardianes que comparan preset ↔ espejo ↔ documentación. Duplicar el preset rompería esa fuente
 * única. En su lugar, esta hoja **re-viste** los mismos componentes dentro del back-office:
 *
 *   · variables de color/fuente para estilos en línea (`var(--amber)`, `var(--azure)`…);
 *   · reglas con especificidad `.admin-surface [class~="bg-mist"]` que ganan a las utilidades;
 *   · variantes (hover, focus, tablet, desktop, opacidades) y clases de radio/sombra.
 *
 * El markup no cambia: los componentes de administración siguen usando `bg-mist`, `text-ink`, etc.
 * La suite pública conserva «Cal & Sal» (preset + :root). Este fichero se genera desde la misma
 * fuente de verdad de las propuestas (`scripts/design/proposals-v3.data.mjs`, PROPOSAL_B).
 *
 * Uso: node scripts/design/build-admin-surface.mjs
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PROPOSAL_B } from "./proposals-v3.data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "apps", "web", "src");
const OUT = join(SRC, "app", "admin-surface.css");

const P = PROPOSAL_B.palette;
const TOKENS = new Set(Object.keys(P));
const ALPHA = (token, percent) => {
  const hex = P[token].replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return percent === null ? P[token] : `rgb(${r} ${g} ${b} / ${percent / 100})`;
};

/** Ficheros fuente (sin tests). */
function files() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
    }
  };
  walk(SRC);
  return out.sort();
}

// Mismo patrón que `lib/a11y/color-usage.ts`: captura utilidades y variantes.
const UTILITY =
  /(?<![a-zA-Z0-9_-])((?:[a-z-]+:)*)((?:text|bg|border|ring|divide|outline|fill|stroke|decoration|placeholder|caret|accent|from|via|to)-([a-z][a-z0-9-]*))(?:\/(\d{1,3}))?(?![a-zA-Z0-9_[-])/g;

const found = new Map();
for (const file of files()) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(UTILITY)) {
    const [, variants = "", utility, token, opacity] = match;
    if (!TOKENS.has(token)) continue;
    const full = `${variants}${utility}${opacity ? `/${opacity}` : ""}`;
    if (!found.has(full)) found.set(full, { variants, utility, token, opacity: opacity ? Number(opacity) : null });
  }
}

const PSEUDO = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  disabled: ":disabled",
  checked: ":checked",
};
const MEDIA = { tablet: "(min-width: 768px)", desktop: "(min-width: 1024px)" };

/** Convierte una utilidad de color en una regla scoped con valor Posidonia. */
function rule(classToken, info) {
  const { variants, utility, token, opacity } = info;
  const property = utility.slice(0, utility.lastIndexOf("-"));
  let pseudo = "";
  let media = null;
  const ancestor = [];
  for (const variant of variants.split(":").filter(Boolean)) {
    if (variant in PSEUDO) pseudo += PSEUDO[variant];
    else if (variant in MEDIA) media = MEDIA[variant];
    else if (variant === "group-hover") ancestor.push(".group:hover");
    else if (variant === "group-open") ancestor.push(".group[open]");
    else return null; // variante no soportada (p. ej. prosa/arbitraria)
  }
  const classSel = `[class~="${classToken}"]`;
  const scope = [".admin-surface", ...ancestor].join(" ");
  const selector = `${scope} ${classSel}${pseudo}`;
  const color = ALPHA(token, opacity);
  let body;
  if (utility.startsWith("from-")) {
    body = `--tw-gradient-from:${color} var(--tw-gradient-from-position);--tw-gradient-to:rgb(0 0 0 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to);`;
  } else if (utility.startsWith("via-")) {
    body = `--tw-gradient-to:rgb(0 0 0 / 0) var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),${color} var(--tw-gradient-via-position),var(--tw-gradient-to);`;
  } else if (utility.startsWith("to-")) {
    body = `--tw-gradient-to:${color} var(--tw-gradient-to-position);`;
  } else if (utility.startsWith("border-")) body = `border-color:${color};`;
  else if (utility.startsWith("ring-")) body = `--tw-ring-color:${color};`;
  else if (utility.startsWith("outline-")) body = `outline-color:${color};`;
  else if (utility.startsWith("fill-")) body = `fill:${color};`;
  else if (utility.startsWith("stroke-")) body = `stroke:${color};`;
  else if (utility.startsWith("decoration-")) body = `text-decoration-color:${color};`;
  else if (utility.startsWith("caret-")) body = `caret-color:${color};`;
  else if (utility.startsWith("accent-")) body = `accent-color:${color};`;
  else if (utility.startsWith("placeholder-")) body = `color:${color};`;
  else if (utility.startsWith("divide-")) body = `border-color:${color};`;
  else if (utility.startsWith("bg-")) body = `background-color:${color};`;
  else body = `color:${color};`;
  const cssRule = `${selector}{${body}}`;
  return media ? `@media ${media}{${cssRule}}` : cssRule;
}

const rules = [...found.entries()].map(([classToken, info]) => rule(classToken, info)).filter(Boolean);
// Reglas de radio y sombra (no son colores pero cambian entre identidades).
const radii = [
  ["rounded-brand-xs", `${PROPOSAL_B.radii["brand-xs"]}px`],
  ["rounded-brand-sm", `${PROPOSAL_B.radii["brand-sm"]}px`],
  ["rounded-brand", `${PROPOSAL_B.radii.brand}px`],
  ["rounded-brand-lg", `${PROPOSAL_B.radii["brand-lg"]}px`],
].map(([cls, value]) => `.admin-surface [class~="${cls}"]{border-radius:${value}}`);
const shadows = [
  ["shadow-card", PROPOSAL_B.shadows.card],
  ["shadow-card-hover", PROPOSAL_B.shadows["card-hover"]],
  ["shadow-modal", PROPOSAL_B.shadows.modal],
]
  .map(([cls, value]) => `.admin-surface [class~="${cls}"]{box-shadow:${value}}`)
  .join("\n");

const vars = Object.entries(P)
  .map(([token, hex]) => `  --${token}: ${hex};`)
  .join("\n");

const css = `/**
 * PIEL «POSIDONIA» (B) DE LA SUITE ADMINISTRATIVA — generado por
 * \`scripts/design/build-admin-surface.mjs\`. NO editar a mano: regenerar el script.
 *
 * Se aplica dentro del scope \`.admin-surface\` (raíz de AdminLayout). La suite pública conserva
 * «Cal & Sal» del preset y de \`:root\`. El markup no cambia: solo se re-visten las mismas
 * utilidades y variables para que los componentes compartidos (DataTable, WalletMenu…) se pinten
 * con la identidad administrativa cuando están dentro del back-office.
 *
 * Fuente de verdad de los valores: \`scripts/design/proposals-v3.data.mjs\` (PROPOSAL_B).
 */

.admin-surface {
  /* Tokens Posidonia para estilos en línea y anillo de foco. */
${vars}
  --font-display: "Spectral";
  --font-sans: "Inter Tight";
  font-family: var(--font-sans), "Segoe UI", system-ui, -apple-system, sans-serif;
  color: var(--ink);
  background-color: var(--mist);
}

/* Tipografía display dentro del scope (la clase usa la variable, pero se refuerza aquí). */
.admin-surface [class~="font-display"] {
  font-family: var(--font-display), "Iowan Old Style", Georgia, serif;
}

/* Radios y elevación de Posidonia. */
${radii.join("\n")}
${shadows}

/* Re-viste de cada utilidad de color encontrada en el producto (solo dentro del scope). */
${rules.join("\n")}
`;

writeFileSync(OUT, css);
console.log(`✅ ${relative(ROOT, OUT)}: ${found.size} clases de color, ${rules.length} reglas, ${css.length} bytes.`);
