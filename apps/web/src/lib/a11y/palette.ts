/**
 * Utilidades de color de la paleta de marca: **tokens reales** del preset compartido
 * (`packages/config/tailwind/preset.cjs`) y del sistema visual «Brisa Marina»
 * de la identidad pública «Cal & Sal» (RepoTecnico/propuestas_v3_identidad/).
 *
 * Por qué existe este espejo en TypeScript: el preset es un módulo CommonJS de build que el
 * cliente no debe empaquetar (Tailwind lo consume en tiempo de compilación), pero las gráficas
 * —que pintan SVG con valores concretos, no con clases— y los tests de contraste necesitan los
 * MISMOS valores. La divergencia silenciosa está prohibida por un test guardián
 * (`a11y.test.ts`) que compara este objeto con el preset real: si alguien cambia el preset y no
 * este fichero (o al revés), la suite se pone roja. Es exactamente el defecto H-21 de la auditoría
 * («la certificación WCAG se medía contra colores que no existen en el preset»).
 */
export const PALETTE = {
  // — Fondos luminosos (caliza) —
  mist: "#F8F3E9",
  "mist-2": "#EFE7D6",
  shell: "#FFFFFF",
  arena: "#E9DDC8",
  // — Texto —
  ink: "#15222C",
  "ink-soft": "#495764",
  // — Marca / acción (azul mar) —
  azure: "#0B5C74",
  "azure-deep": "#084659",
  // — Registro oscuro (hero, pie, velo) —
  navy: "#0F2833",
  "navy-soft": "#1A3B49",
  pearl: "#D9E8EC",
  // — Acento de atención (terracota) —
  coral: "#AE4E2A",
  "coral-text": "#8F3D1E",
  // — Premium sobre claro y estados de habitación —
  amber: "#9A6A12",
  fern: "#56682F",
  // — Bordes —
  line: "#E4D9C5",
  "line-strong": "#8B7A62",
  // — Estados semánticos —
  success: "#1C6E48",
  "success-bg": "#E2F0E8",
  warning: "#875A0B",
  "warning-bg": "#F9EFD4",
  error: "#A62A1F",
  "error-bg": "#F7E3DF",
  info: "#1E6273",
  "info-bg": "#E1EDF1",
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
 * `text-white` sobre `bg-azure` quedaría fuera de la verificación y sería un punto ciego.
 */
export const NEUTRAL_HEX: Readonly<Record<string, string>> = {
  white: "#FFFFFF",
  black: "#000000",
  transparent: "#FFFFFF",
  current: "#15222C",
  inherit: "#15222C",
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
  { foreground: "ink", background: "mist", where: "texto principal sobre lienzo porcelana" },
  { foreground: "ink", background: "mist-2", where: "texto principal sobre banda mist-2" },
  { foreground: "ink-soft", background: "shell", where: "texto secundario sobre tarjeta blanca" },
  { foreground: "ink-soft", background: "mist", where: "texto secundario sobre lienzo porcelana" },
  { foreground: "ink-soft", background: "mist-2", where: "texto secundario sobre banda mist-2" },
  { foreground: "azure", background: "shell", where: "enlace/acción sobre tarjeta blanca" },
  { foreground: "azure-deep", background: "shell", where: "título de marca sobre tarjeta blanca" },
  { foreground: "azure-deep", background: "mist", where: "título de marca sobre lienzo porcelana" },
  { foreground: "coral-text", background: "shell", where: "aviso/etiqueta sobre tarjeta blanca" },
  { foreground: "coral-text", background: "mist", where: "aviso/etiqueta sobre lienzo porcelana" },
  { foreground: "fern", background: "shell", where: "etiqueta secundaria sobre tarjeta blanca" },
  { foreground: "shell", background: "azure", where: "texto blanco sobre acción primaria" },
  { foreground: "shell", background: "azure-deep", where: "texto blanco sobre acción profunda" },
  { foreground: "shell", background: "coral", where: "texto blanco sobre relleno de atención" },
  { foreground: "shell", background: "coral-text", where: "texto blanco sobre aviso coral" },
  { foreground: "shell", background: "fern", where: "texto blanco sobre etiqueta helecho" },
  { foreground: "shell", background: "amber", where: "etiqueta premium (shell sobre ámbar)" },
  { foreground: "ink", background: "arena", where: "texto principal sobre superficie arena" },
  { foreground: "ink-soft", background: "arena", where: "texto secundario sobre superficie arena" },
  { foreground: "ink", background: "line", where: "texto principal sobre separador (chips)" },
  { foreground: "ink-soft", background: "line", where: "texto secundario sobre separador (chips)" },
  { foreground: "white", background: "azure", where: "texto blanco (utilidad) sobre acción primaria" },
  { foreground: "white", background: "azure-deep", where: "texto blanco (utilidad) sobre acción profunda" },
  { foreground: "white", background: "ink", where: "texto sobre velo oscuro de marca (modal/menú)" },
  { foreground: "ink", background: "white", where: "texto principal sobre panel blanco (modales)" },
  { foreground: "ink-soft", background: "white", where: "texto secundario sobre panel blanco" },
  // Registro oscuro (`navy`) y detalle premium: medidos en `scripts/design/contrast-audit.mjs`.
  { foreground: "mist", background: "navy", where: "texto porcelana sobre superficie marina" },
  { foreground: "shell", background: "navy", where: "texto blanco sobre superficie marina" },
  { foreground: "shell", background: "navy-soft", where: "texto blanco sobre superficie marina suave" },
  { foreground: "navy", background: "shell", where: "título marino sobre tarjeta blanca (sidebar activo)" },
  { foreground: "pearl", background: "navy", where: "detalle perla sobre marina (iconos, cifras)" },
  { foreground: "pearl", background: "navy-soft", where: "filete/etiqueta perla sobre marina suave" },
  // Estados semánticos: el color de estado se usa como texto sobre su propio fondo teñido.
  { foreground: "success", background: "success-bg", where: "confirmación sobre su fondo teñido" },
  { foreground: "success", background: "mist", where: "confirmación como texto sobre porcelana" },
  { foreground: "warning", background: "warning-bg", where: "aviso sobre su fondo teñido" },
  { foreground: "warning", background: "mist", where: "aviso como texto sobre porcelana" },
  { foreground: "error", background: "error-bg", where: "error sobre su fondo teñido" },
  { foreground: "error", background: "mist", where: "error como texto sobre porcelana" },
  { foreground: "info", background: "info-bg", where: "información sobre su fondo teñido" },
  { foreground: "info", background: "mist", where: "información como texto sobre porcelana" },
  { foreground: "ink", background: "success-bg", where: "texto principal sobre banda de confirmación" },
  { foreground: "ink", background: "warning-bg", where: "texto principal sobre banda de aviso" },
  { foreground: "ink", background: "error-bg", where: "texto principal sobre banda de error" },
  { foreground: "ink", background: "info-bg", where: "texto principal sobre banda informativa" },
  { foreground: "shell", background: "success", where: "texto blanco sobre relleno de confirmación" },
  { foreground: "shell", background: "error", where: "texto blanco sobre relleno de error" },
];
