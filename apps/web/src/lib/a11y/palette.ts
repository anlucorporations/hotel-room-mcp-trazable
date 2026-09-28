/**
 * Utilidades de color de la paleta de marca: **tokens reales** del preset compartido
 * (`packages/config/tailwind/preset.cjs`) y del sistema visual «Mediterráneo editorial».
 *
 * Por qué existe este espejo en TypeScript: el preset es un módulo CommonJS de build que el
 * cliente no debe empaquetar (Tailwind lo consume en tiempo de compilación), pero las gráficas
 * —que pintan SVG con valores concretos, no con clases— y los tests de contraste necesitan los
 * MISMOS valores. La divergencia silenciosa está prohibida por un test guardián
 * (`palette.test.ts`) que compara este objeto con el preset real: si alguien cambia el preset y no
 * este fichero (o al revés), la suite se pone roja. Es exactamente el defecto H-21 de la auditoría
 * («la certificación WCAG se medía contra colores que no existen en el preset»).
 */
export const PALETTE = {
  // — Sistema vigente «Mediterráneo editorial» (sin cambios) —
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
  // — Tokens aditivos del sistema visual (propuesta de imagen visual, 2026-09-27) —
  ocean: "#0F2C3F",
  "ocean-soft": "#16455E",
  champagne: "#C5A880",
  "line-strong": "#8F7F5F",
  success: "#2F6B4F",
  "success-bg": "#E3EFE7",
  warning: "#8A5A12",
  "warning-bg": "#F7E9C9",
  error: "#9E2B1F",
  "error-bg": "#F8E3DE",
  info: "#14556B",
  "info-bg": "#DCEAF1",
} as const;

/** Token de color de la paleta de marca. */
export type PaletteToken = keyof typeof PALETTE;

/**
 * Colores que NO son de la paleta de marca: utilidades propias de Tailwind (blanco/negro/
 * transparente) y palabras clave de CSS. Se listan explícitamente para que el guardián de
 * utilidades pueda distinguir «color legítimo» de «color inventado» sin aceptar cualquier cosa.
 */
export const NEUTRAL_COLOR_TOKENS: readonly string[] = [
  "white",
  "black",
  "transparent",
  "current",
  "inherit",
  "none",
];

/**
 * Hex de los neutros admitidos, para poder **medir** su contraste (no solo aceptarlos): sin esto,
 * `text-white` sobre `bg-sea` quedaría fuera de la verificación y sería un punto ciego.
 */
export const NEUTRAL_HEX: Readonly<Record<string, string>> = {
  white: "#FFFFFF",
  black: "#000000",
  transparent: "#FFFFFF",
  current: "#1B2327",
  inherit: "#1B2327",
  none: "#FFFFFF",
};

/** Cualquier color medible: un token de marca o un neutro con hex declarado. */
export type MeasurableColor = PaletteToken | keyof typeof NEUTRAL_HEX;

/**
 * Combinaciones texto/fondo declaradas como legítimas por el sistema visual, con la superficie
 * sobre la que se aplican. El guardián de contraste las mide TODAS sobre la paleta real; las que
 * aparecen juntas en un mismo `className` se comprueban además automáticamente (ver
 * `a11y.test.ts`), de modo que una clase nueva con contraste insuficiente no pasa desapercibida.
 */
export const DECLARED_TEXT_ON_BACKGROUND: ReadonlyArray<{
  readonly foreground: MeasurableColor;
  readonly background: MeasurableColor;
  readonly where: string;
}> = [
  { foreground: "ink", background: "shell", where: "texto principal sobre tarjeta blanca" },
  { foreground: "ink", background: "sand", where: "texto principal sobre lienzo arena" },
  { foreground: "ink", background: "sand-2", where: "texto principal sobre banda arena-2" },
  { foreground: "ink-soft", background: "shell", where: "texto secundario sobre tarjeta blanca" },
  { foreground: "ink-soft", background: "sand", where: "texto secundario sobre lienzo arena" },
  { foreground: "ink-soft", background: "sand-2", where: "texto secundario sobre banda arena-2" },
  { foreground: "sea", background: "shell", where: "enlace/acción sobre tarjeta blanca" },
  { foreground: "sea-deep", background: "shell", where: "título de marca sobre tarjeta blanca" },
  { foreground: "sea-deep", background: "sand", where: "título de marca sobre lienzo arena" },
  { foreground: "terracotta-text", background: "shell", where: "aviso/etiqueta sobre tarjeta blanca" },
  { foreground: "terracotta-text", background: "sand", where: "aviso/etiqueta sobre lienzo arena" },
  { foreground: "olive", background: "shell", where: "etiqueta secundaria sobre tarjeta blanca" },
  { foreground: "shell", background: "sea", where: "texto blanco sobre acción primaria" },
  { foreground: "shell", background: "sea-deep", where: "texto blanco sobre acción profunda" },
  { foreground: "shell", background: "terracotta-text", where: "texto blanco sobre aviso terracota" },
  { foreground: "shell", background: "olive", where: "texto blanco sobre etiqueta oliva" },
  { foreground: "ink", background: "line", where: "texto principal sobre separador (chips)" },
  { foreground: "ink-soft", background: "line", where: "texto secundario sobre separador (chips)" },
  { foreground: "white", background: "sea", where: "texto blanco (utilidad) sobre acción primaria" },
  { foreground: "white", background: "sea-deep", where: "texto blanco (utilidad) sobre acción profunda" },
  { foreground: "white", background: "ink", where: "texto sobre velo oscuro de marca (modal/menú)" },
  { foreground: "ink", background: "white", where: "texto principal sobre panel blanco (modales)" },
  { foreground: "ink-soft", background: "white", where: "texto secundario sobre panel blanco" },
  // Registro oscuro editorial (`ocean`) y detalle premium: medidos en `scripts/design/contrast-audit.mjs`.
  { foreground: "sand", background: "ocean", where: "texto arena sobre superficie marina" },
  { foreground: "shell", background: "ocean", where: "texto blanco sobre superficie marina" },
  { foreground: "ocean", background: "shell", where: "título marino sobre tarjeta blanca (sidebar activo)" },
  { foreground: "champagne", background: "ocean", where: "detalle champagne sobre marina (iconos, cifras)" },
  { foreground: "champagne", background: "ocean-soft", where: "filete/etiqueta champagne sobre marina suave" },
  // Estados semánticos: el color de estado se usa como texto sobre su propio fondo teñido.
  { foreground: "success", background: "success-bg", where: "confirmación sobre su fondo teñido" },
  { foreground: "success", background: "sand", where: "confirmación como texto sobre arena" },
  { foreground: "warning", background: "warning-bg", where: "aviso sobre su fondo teñido" },
  { foreground: "warning", background: "sand", where: "aviso como texto sobre arena" },
  { foreground: "error", background: "error-bg", where: "error sobre su fondo teñido" },
  { foreground: "error", background: "sand", where: "error como texto sobre arena" },
  { foreground: "info", background: "info-bg", where: "información sobre su fondo teñido" },
  { foreground: "info", background: "sand", where: "información como texto sobre arena" },
  { foreground: "ink", background: "success-bg", where: "texto principal sobre banda de confirmación" },
  { foreground: "ink", background: "warning-bg", where: "texto principal sobre banda de aviso" },
  { foreground: "ink", background: "error-bg", where: "texto principal sobre banda de error" },
  { foreground: "ink", background: "info-bg", where: "texto principal sobre banda informativa" },
  { foreground: "shell", background: "success", where: "texto blanco sobre relleno de confirmación" },
  { foreground: "shell", background: "error", where: "texto blanco sobre relleno de error" },
];
