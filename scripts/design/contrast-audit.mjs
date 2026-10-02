#!/usr/bin/env node
/**
 * Instrumento de auditoría de contraste del sistema visual **«Brisa Marina»**
 * (Manual_Identidad_Visual.md v2.0.0 · rediseño 2026-10).
 *
 * Por qué existe: la cultura del proyecto exige instrumento y artefacto para cada afirmación de
 * calidad (ADR-23). Este guion mide con la MISMA matemática de WCAG 2.1 que usa el producto
 * (`apps/web/src/lib/a11y/contrast.ts`: luminancia relativa + ratio sin redondear) y publica una
 * tabla Markdown lista para pegar en el manual de identidad visual.
 *
 * Los pares medidos aquí son el superconjunto de `DECLARED_TEXT_ON_BACKGROUND`
 * (`apps/web/src/lib/a11y/palette.ts`) más los velos compuestos del hero y las fronteras de
 * control (WCAG 1.4.11). Si un valor de este fichero y del preset divergen, el guardián
 * `a11y.test.ts` pone roja la suite: este script es documentación ejecutable, no fuente de verdad.
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

const verdict = (value, min = 4.5) => {
  if (value < min) return "NO conforme ❌";
  if (value >= 7) return "AAA ✅";
  if (value >= 4.5) return "AA ✅";
  return `componente ≥${min}:1 ✅`;
};

// ── Paleta «Brisa Marina» (espejo de packages/config/tailwind/preset.cjs) ─────────────────

const PALETTE = {
  mist: "#F4F9FC",
  "mist-2": "#E6F0F6",
  shell: "#FFFFFF",
  line: "#DBE7EF",
  "line-strong": "#6B8296",
  ink: "#101F2C",
  "ink-soft": "#41566A",
  azure: "#0F6C9C",
  "azure-deep": "#0A4F75",
  navy: "#0E2A3F",
  "navy-soft": "#1A4160",
  pearl: "#C3D4E0",
  coral: "#C4522C",
  "coral-text": "#A34222",
  amber: "#B98324",
  fern: "#276E4C",
  success: "#1F7A4D",
  "success-bg": "#E2F2E9",
  warning: "#8A5F0C",
  "warning-bg": "#FBF0D6",
  error: "#B3261E",
  "error-bg": "#FAE5E3",
  info: "#0F6380",
  "info-bg": "#E0EFF5",
};

const OVERLAY_ALPHA = 0.65;
const OVERLAY = composite(PALETTE.navy, OVERLAY_ALPHA, PALETTE.shell);
const OVERLAY_SOFT = composite(PALETTE.navy, 0.35, PALETTE.shell);

// ── Pares a medir (texto ≥4.5:1 · componentes/fronteras ≥3:1) ─────────────────────────────

const PARES_TEXTO = [
  ["#101F2C", "#FFFFFF", "ink sobre shell (texto principal en tarjetas)"],
  ["#101F2C", "#F4F9FC", "ink sobre mist (texto principal sobre lienzo)"],
  ["#101F2C", "#E6F0F6", "ink sobre mist-2 (bandas, filas alternas)"],
  ["#41566A", "#FFFFFF", "ink-soft sobre shell (texto secundario)"],
  ["#41566A", "#F4F9FC", "ink-soft sobre mist (texto secundario)"],
  ["#41566A", "#E6F0F6", "ink-soft sobre mist-2 (texto secundario)"],
  ["#0F6C9C", "#FFFFFF", "azure sobre shell (enlaces, acción como texto)"],
  ["#0F6C9C", "#F4F9FC", "azure sobre mist (enlaces)"],
  ["#0A4F75", "#FFFFFF", "azure-deep sobre shell (títulos de marca, hover)"],
  ["#0A4F75", "#F4F9FC", "azure-deep sobre mist (títulos de marca)"],
  ["#A34222", "#FFFFFF", "coral-text sobre shell (avisos, etiquetas)"],
  ["#A34222", "#F4F9FC", "coral-text sobre mist (avisos, etiquetas)"],
  ["#276E4C", "#FFFFFF", "fern sobre shell (etiqueta «disponible»)"],
  ["#276E4C", "#F4F9FC", "fern sobre mist (etiqueta «disponible»)"],
  ["#276E4C", composite("#276E4C", 0.10, "#F4F9FC"), "fern sobre su tinte al 10 % (chip LIBRE de recepción)"],
  ["#101F2C", "#DBE7EF", "ink sobre line (chips sobre separador)"],
  ["#41566A", "#DBE7EF", "ink-soft sobre line (chips sobre separador)"],
  ["#FFFFFF", "#0F6C9C", "shell sobre azure (botón primario)"],
  ["#FFFFFF", "#0A4F75", "shell sobre azure-deep (botón primario hover)"],
  ["#FFFFFF", "#C4522C", "shell sobre coral (relleno de atención)"],
  ["#FFFFFF", "#A34222", "shell sobre coral-text (aviso invertido)"],
  ["#FFFFFF", "#276E4C", "shell sobre fern (etiqueta disponible invertida)"],
  ["#101F2C", "#B98324", "ink sobre amber (etiqueta premium en claro)"],
  ["#F4F9FC", "#0E2A3F", "mist sobre navy (registro oscuro: hero, pie, AdminLTE)"],
  ["#FFFFFF", "#0E2A3F", "shell sobre navy (registro oscuro)"],
  ["#FFFFFF", "#1A4160", "shell sobre navy-soft (hover en sidebar)"],
  ["#0E2A3F", "#FFFFFF", "navy sobre shell (pastilla activa del sidebar, títulos)"],
  ["#C3D4E0", "#0E2A3F", "pearl sobre navy (detalle premium en oscuro)"],
  ["#C3D4E0", "#1A4160", "pearl sobre navy-soft (filetes, etiquetas)"],
  ["#FFFFFF", OVERLAY, `shell sobre velo navy ${Math.round(OVERLAY_ALPHA * 100)} % (texto del hero)`],
  ["#F4F9FC", OVERLAY, `mist sobre velo navy ${Math.round(OVERLAY_ALPHA * 100)} % (texto del hero)`],
  ["#1F7A4D", "#E2F2E9", "success sobre success-bg (banda de confirmación)"],
  ["#1F7A4D", "#F4F9FC", "success sobre mist (confirmación como texto)"],
  ["#8A5F0C", "#FBF0D6", "warning sobre warning-bg (banda de aviso)"],
  ["#8A5F0C", "#F4F9FC", "warning sobre mist (aviso como texto)"],
  ["#B3261E", "#FAE5E3", "error sobre error-bg (banda de error)"],
  ["#B3261E", "#F4F9FC", "error sobre mist (error como texto)"],
  ["#0F6380", "#E0EFF5", "info sobre info-bg (banda informativa)"],
  ["#0F6380", "#F4F9FC", "info sobre mist (información como texto)"],
  ["#101F2C", "#E2F2E9", "ink sobre success-bg (texto principal en banda)"],
  ["#101F2C", "#FBF0D6", "ink sobre warning-bg (texto principal en banda)"],
  ["#101F2C", "#FAE5E3", "ink sobre error-bg (texto principal en banda)"],
  ["#101F2C", "#E0EFF5", "ink sobre info-bg (texto principal en banda)"],
  ["#FFFFFF", "#1F7A4D", "shell sobre success (relleno de confirmación)"],
  ["#FFFFFF", "#B3261E", "shell sobre error (relleno de error)"],
];

const PARES_COMPONENTE = [
  ["#6B8296", "#F4F9FC", "line-strong sobre mist (frontera de control, WCAG 1.4.11)", 3],
  ["#6B8296", "#E6F0F6", "line-strong sobre mist-2 (frontera de control)", 3],
  ["#6B8296", "#FFFFFF", "line-strong sobre shell (frontera de control)", 3],
  ["#0F6C9C", "#FFFFFF", "azure como serie de gráfica sobre tarjeta (1.4.11)", 3],
  ["#A34222", "#FFFFFF", "coral-text como serie de gráfica sobre tarjeta (1.4.11)", 3],
];

// Combinaciones PROHIBIDAS (se miden para documentar el porqué, no para aprobarlas):
const PARES_PROHIBIDOS = [
  ["#FFFFFF", OVERLAY_SOFT, "shell sobre velo navy 35 %: ni siquiera texto grande (prohibido; el velo mínimo es 65 %)"],
  ["#C3D4E0", "#FFFFFF", "pearl como texto sobre claro (solo vale sobre navy/navy-soft)"],
  ["#B98324", "#FFFFFF", "amber como texto sobre blanco (detalle decorativo, nunca texto)"],
  ["#DBE7EF", "#F4F9FC", "line como frontera de control sobre mist (1,19:1; usar line-strong)"],
];

// ── Salida ─────────────────────────────────────────────────────────────────────────────────

const row = (fg, bg, use, min = 4.5) => {
  const value = ratio(fg, bg);
  return `| \`${fg}\` | \`${bg}\` | ${value.toFixed(2)}:1 | ${verdict(value, min)} | ${use} |`;
};

const paletteTable = (title, palette) =>
  [
    `### ${title}`,
    "",
    "| Token | HEX | HSL |",
    "|---|---|---|",
    ...Object.entries(palette).map(([name, hex]) => {
      const { h, s, l } = toHsl(hex);
      return `| \`${name}\` | \`${hex}\` | hsl(${h} ${s}% ${l}%) |`;
    }),
    "",
  ].join("\n");

const pairsTable = (title, pairs, min = 4.5) =>
  [
    `### ${title}`,
    "",
    "| Texto | Fondo | Ratio | Veredicto | Uso previsto |",
    "|---|---|---|---|---|",
    ...pairs.map((p) => row(p[0], p[1], p[2], p[3] ?? min)),
    "",
  ].join("\n");

console.log("# Auditoría de contraste — sistema visual «Brisa Marina» (v2.0.0)\n");
console.log(`> Fórmula WCAG 2.1 (luminancia relativa + ratio sin redondear). Velo compuesto:`);
console.log(`> \`navy\` ${PALETTE.navy} al ${Math.round(OVERLAY_ALPHA * 100)} % sobre blanco = \`${OVERLAY}\`;`);
console.log(`> al 35 % = \`${OVERLAY_SOFT}\`.`);
console.log(`> Excepción declarada: el texto **deshabilitado** queda fuera del requisito de contraste`);
console.log(`> (WCAG 2.1 · 1.4.3, «inactive user interface components»); se documenta como exento.\n`);
console.log(paletteTable("1. Paleta «Brisa Marina» (preset real)", PALETTE));
console.log(pairsTable("2. Pares de texto (mínimo 4.5:1)", PARES_TEXTO));
console.log(pairsTable("3. Componentes no textuales y fronteras (mínimo 3:1)", PARES_COMPONENTE, 3));
console.log(
  pairsTable("4. Combinaciones PROHIBIDAS (medidas para documentar)", PARES_PROHIBIDOS.map((p) => [...p, 99])),
);

const failing = [
  ...PARES_TEXTO.map(([fg, bg, use]) => ({ fg, bg, use, min: 4.5, value: ratio(fg, bg) })),
  ...PARES_COMPONENTE.map(([fg, bg, use, min]) => ({ fg, bg, use, min, value: ratio(fg, bg) })),
].filter((pair) => pair.value < pair.min);

console.log("### Resumen\n");
console.log(`- Pares medidos: **${PARES_TEXTO.length + PARES_COMPONENTE.length}**`);
console.log(`- Por debajo de su mínimo: **${failing.length}**`);
for (const pair of failing) {
  console.log(`  - \`${pair.fg}\` sobre \`${pair.bg}\` = ${pair.value.toFixed(2)}:1 (mín ${pair.min}) — ${pair.use}`);
}

if (process.argv.includes("--json")) {
  console.log("\n```json");
  console.log(
    JSON.stringify(
      {
        sistema: "Brisa Marina v2.0.0",
        overlay: { alpha: OVERLAY_ALPHA, onWhite: OVERLAY, soft: OVERLAY_SOFT },
        palette: PALETTE,
        pares: [...PARES_TEXTO, ...PARES_COMPONENTE].map(([fg, bg, use, min]) => ({
          fg,
          bg,
          use,
          min: min ?? 4.5,
          ratio: Number(ratio(fg, bg).toFixed(2)),
        })),
      },
      null,
      2,
    ),
  );
  console.log("```");
}
