/**
 * Utilidades matemáticas para verificación de WCAG 2.1 Nivel AA
 * Fórmula de Luminancia Relativa y Ratio de Contraste según especificación W3C:
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const sanitized = hex.replace('#', '');
  const r = parseInt(sanitized.substring(0, 2), 16);
  const g = parseInt(sanitized.substring(2, 4), 16);
  const b = parseInt(sanitized.substring(4, 6), 16);
  return { r, g, b };
}

export function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const transform = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rs = transform(rgb.r);
  const gs = transform(rgb.g);
  const bs = transform(rgb.b);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  return Number(contrastRatioRaw(hex1, hex2).toFixed(2));
}

/**
 * Ratio de contraste SIN redondear. Es el valor con el que se decide el cumplimiento: redondear
 * antes de comparar declaraba apto un contraste real de 4,4994 (lo señaló la verificación de M7).
 */
export function contrastRatioRaw(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hexToRgb(hex1));
  const l2 = getRelativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function verifyWcagAA(
  textColorHex: string,
  bgColorHex: string,
  isLargeText = false
): { ratio: number; passes: boolean; minRequired: number } {
  // El veredicto usa el ratio exacto; `ratio` va redondeado solo para mostrarlo.
  const raw = contrastRatioRaw(textColorHex, bgColorHex);
  const minRequired = isLargeText ? 3.0 : 4.5;
  return {
    ratio: Number(raw.toFixed(2)),
    passes: raw >= minRequired,
    minRequired,
  };
}
