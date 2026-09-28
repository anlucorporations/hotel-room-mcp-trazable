#!/usr/bin/env node
/**
 * Instrumento de auditoría de contraste de la **propuesta de imagen visual** (Fase 1 del
 * skill `visual-ui-ux`).
 *
 * Por qué existe: la cultura del proyecto exige instrumento y artefacto para cada afirmación de
 * calidad (ADR-23). Este guion mide con la MISMA matemática de WCAG 2.1 que usa el producto
 * (`apps/web/src/lib/a11y/contrast.ts`: luminancia relativa + ratio sin redondear) y publica una
 * tabla Markdown lista para pegar en `RepoTecnico/propuesta_imagen_visual.md`.
 *
 * Uso:
 *   node scripts/design/contrast-audit.mjs
 *   node scripts/design/contrast-audit.mjs --json    # además, volcado JSON
 *
 * No tiene dependencias: se puede ejecutar sin instalar nada.
 */

/** Luminancia relativa (WCAG 2.1, https://www.w3.org/WAI/GL/wiki/Relative_luminance). */
const srgb = (channel) => {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};

/** Ratio de contraste SIN redondear: redondear antes de comparar declara apto un 4,4994. */
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Composición alfa (para velos sobre superficie): `rgba(color, alpha)` sobre `base`. */
const composite = (color, alpha, base) => {
  const c = hexToRgb(color);
  const b = hexToRgb(base);
  const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha));
  return `#${[mix(c.r, b.r), mix(c.g, b.g), mix(c.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
};

const toHsl = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const verdict = (value) => {
  if (value >= 7) return "AAA ✅";
  if (value >= 4.5) return "AA ✅";
  if (value >= 3) return "solo texto grande / gráficos ⚠️";
  return "NO conforme ❌";
};

// ── Paletas ────────────────────────────────────────────────────────────────────────────────

/** Sistema vigente (packages/config/tailwind/preset.cjs) — NO se toca. */
const ACTUAL = {
  sand: "#FBF6EC",
  "sand-2": "#F3EAD8",
  shell: "#FFFFFF",
  line: "#E7DCC6",
  ink: "#1B2327",
  "ink-soft": "#4C575C",
  sea: "#0E5A63",
  "sea-deep": "#08424A",
  terracotta: "#C0542E",
  "terracotta-text": "#A8431F",
  olive: "#5E6B45",
  gold: "#C68A2E",
};

/** Paleta del documento `RepoTecnico/propuestaVisual-Hotel.md` (Marina Sol). */
const DOCUMENTO = {
  "océano profundo": "#0F2C3F",
  "arena cálida": "#F7F4EE",
  "terracota A": "#C86446",
  "terracota B": "#D96B43",
  champagne: "#C5A880",
  blanco: "#FFFFFF",
  "texto primario": "#1C242B",
  "texto secundario": "#6B7280",
};

/** Tokens nuevos propuestos (aditivos: el sistema vigente se queda como está). */
const NUEVOS = {
  ocean: "#0F2C3F",
  "ocean-soft": "#16455E",
  champagne: "#C5A880",
  success: "#2F6B4F",
  "success-text": "#24603F",
  "success-bg": "#E3EFE7",
  warning: "#8A5A12",
  "warning-bg": "#F7E9C9",
  error: "#9E2B1F",
  "error-bg": "#F8E3DE",
  info: "#14556B",
  "info-bg": "#DCEAF1",
  "ink-muted": "#6B7280",
  "ink-disabled": "#9AA3A8",
};

const OVERLAY_ALPHA = 0.65;
const OVERLAY = composite(NUEVOS.ocean, OVERLAY_ALPHA, ACTUAL.shell);
const OVERLAY_SOFT = composite(NUEVOS.ocean, 0.35, ACTUAL.shell);

// ── Pares a medir ──────────────────────────────────────────────────────────────────────────

const PARES_DOCUMENTO = [
  ["#0F2C3F", "#F7F4EE", "Titular marino sobre arena (hero, textos largos)"],
  ["#0F2C3F", "#FFFFFF", "Titular marino sobre blanco (tarjetas)"],
  ["#FFFFFF", "#0F2C3F", "Texto blanco sobre superficie marina (footer, velo)"],
  ["#C86446", "#F7F4EE", "Terracota A como TEXTO sobre arena (CTA en texto, enlaces)"],
  ["#C86446", "#FFFFFF", "Terracota A como TEXTO sobre blanco"],
  ["#FFFFFF", "#C86446", "Texto blanco sobre botón terracota A"],
  ["#D96B43", "#F7F4EE", "Terracota B como TEXTO sobre arena"],
  ["#FFFFFF", "#D96B43", "Texto blanco sobre botón terracota B"],
  ["#C5A880", "#FFFFFF", "Champagne como TEXTO sobre blanco (estrellas, cifras)"],
  ["#C5A880", "#F7F4EE", "Champagne como TEXTO sobre arena"],
  ["#C5A880", "#0F2C3F", "Champagne sobre marina (filetes, iconos)"],
  ["#1C242B", "#F7F4EE", "Texto primario del documento sobre arena"],
  ["#6B7280", "#FFFFFF", "Texto secundario del documento sobre blanco"],
  ["#6B7280", "#F7F4EE", "Texto secundario del documento sobre arena"],
];

const PARES_NUEVOS = [
  ["#FBF6EC", "#0F2C3F", "Arena sobre marina (hero oscuro, pie de página)"],
  ["#FFFFFF", OVERLAY, `Blanco sobre velo marino ${Math.round(OVERLAY_ALPHA * 100)} % (texto del hero)`],
  ["#FBF6EC", OVERLAY, `Arena sobre velo marino ${Math.round(OVERLAY_ALPHA * 100)} % (texto del hero)`],
  ["#FFFFFF", OVERLAY_SOFT, "Blanco sobre velo marino 35 % (peor caso: imagen clara debajo)"],
  ["#C5A880", "#0F2C3F", "Champagne sobre marina (filete decorativo ≥3:1)"],
  ["#C5A880", "#16455E", "Champagne sobre marina suave (borde/icono)"],
  ["#C68A2E", "#1B2327", "gold sobre ink (estrellas sobre superficie oscura)"],
  ["#24603F", "#FBF6EC", "success-text sobre arena"],
  ["#FFFFFF", "#2F6B4F", "Blanco sobre success (fondo)"],
  ["#8A5A12", "#FBF6EC", "warning-text sobre arena"],
  ["#1B2327", "#F7E9C9", "Texto principal sobre fondo warning"],
  ["#9E2B1F", "#FBF6EC", "error-text sobre arena"],
  ["#FFFFFF", "#9E2B1F", "Blanco sobre error (fondo)"],
  ["#14556B", "#FBF6EC", "info-text sobre arena"],
  ["#14556B", "#DCEAF1", "info-text sobre fondo info"],
  ["#C0542E", "#FFFFFF", "terracotta VIGENTE como fondo de botón (texto blanco)"],
  ["#A8431F", "#FBF6EC", "terracotta-text VIGENTE sobre arena (enlaces, avisos)"],
  ["#4C575C", "#FBF6EC", "ink-soft VIGENTE sobre arena (texto secundario)"],
];

// ── Salida ─────────────────────────────────────────────────────────────────────────────────

const row = (fg, bg, use) => {
  const value = ratio(fg, bg);
  return `| \`${fg}\` | \`${bg}\` | ${value.toFixed(2)}:1 | ${verdict(value)} | ${use} |`;
};

const paletteTable = (title, palette) =>
  [
    `### ${title}`,
    "",
    "| Token | HEX | HSL | Muestra |",
    "|---|---|---|---|",
    ...Object.entries(palette).map(([name, hex]) => {
      const { h, s, l } = toHsl(hex);
      return `| \`${name}\` | \`${hex}\` | hsl(${h} ${s}% ${l}%) | ![](${hex}) |`;
    }),
    "",
  ].join("\n");

const pairsTable = (title, pairs) =>
  [
    `### ${title}`,
    "",
    "| Texto | Fondo | Ratio | Veredicto AA/AAA | Uso previsto |",
    "|---|---|---|---|---|",
    ...pairs.map(([fg, bg, use]) => row(fg, bg, use)),
    "",
  ].join("\n");

console.log("# Auditoría de contraste — propuesta de imagen visual\n");
console.log(`> Fórmula WCAG 2.1 (luminancia relativa + ratio sin redondear). Velo compuesto:`);
console.log(`> \`ocean\` ${NUEVOS.ocean} al ${Math.round(OVERLAY_ALPHA * 100)} % sobre blanco = \`${OVERLAY}\`;`);
console.log(`> al 35 % = \`${OVERLAY_SOFT}\`.`);
console.log(`> Excepción declarada: el texto **deshabilitado** queda fuera del requisito de contraste`);
console.log(`> (WCAG 2.1 · 1.4.3, «inactive user interface components»); se documenta como exento.\n`);
console.log(paletteTable("1. Sistema vigente («Mediterráneo editorial»)", ACTUAL));
console.log(paletteTable("2. Paleta del documento de referencia (Marina Sol)", DOCUMENTO));
console.log(paletteTable("3. Tokens nuevos propuestos (aditivos)", NUEVOS));
console.log(pairsTable("4. Pares del documento de referencia", PARES_DOCUMENTO));
console.log(pairsTable("5. Pares de los tokens nuevos", PARES_NUEVOS));

const failing = [
  ...PARES_DOCUMENTO.map(([fg, bg, use]) => ({ fg, bg, use, value: ratio(fg, bg), origen: "documento" })),
  ...PARES_NUEVOS.map(([fg, bg, use]) => ({ fg, bg, use, value: ratio(fg, bg), origen: "nuevos" })),
].filter((pair) => pair.value < 4.5);

console.log("### Resumen\n");
console.log(`- Pares medidos: **${PARES_DOCUMENTO.length + PARES_NUEVOS.length}**`);
console.log(`- Por debajo de AA (4,5:1) para texto normal: **${failing.length}**`);
for (const pair of failing) {
  console.log(`  - \`${pair.fg}\` sobre \`${pair.bg}\` = ${pair.value.toFixed(2)}:1 — ${pair.use}`);
}

if (process.argv.includes("--json")) {
  console.log("\n```json");
  console.log(
    JSON.stringify(
      {
        overlay: { alpha: OVERLAY_ALPHA, onWhite: OVERLAY, soft: OVERLAY_SOFT },
        actual: ACTUAL,
        documento: DOCUMENTO,
        nuevos: NUEVOS,
        pares: [...PARES_DOCUMENTO, ...PARES_NUEVOS].map(([fg, bg, use]) => ({
          fg,
          bg,
          use,
          ratio: Number(ratio(fg, bg).toFixed(2)),
        })),
      },
      null,
      2,
    ),
  );
  console.log("```");
}
