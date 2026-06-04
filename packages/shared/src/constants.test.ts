import { describe, expect, it } from "vitest";
import preset from "@hotel/config/tailwind/preset";
import {
  BREAKPOINT_DESKTOP_PX,
  BREAKPOINT_TABLET_PX,
  TOUCH_TARGET_MIN_PX,
} from "./constants";

/**
 * Guardián de fuente única: el preset de Tailwind (build, CommonJS) no puede importar las
 * constantes ESM, así que este test verifica que sus valores no divergen (RNF-01).
 */
const px = (value: string): number => Number.parseInt(value, 10);

describe("constantes UI ↔ preset de Tailwind (fuente única)", () => {
  it("los breakpoints coinciden", () => {
    expect(px(preset.theme.screens.tablet)).toBe(BREAKPOINT_TABLET_PX);
    expect(px(preset.theme.screens.desktop)).toBe(BREAKPOINT_DESKTOP_PX);
  });

  it("el área táctil mínima coincide", () => {
    const minHeight = preset.theme.extend.minHeight as Record<string, string>;
    expect(px(minHeight.touch)).toBe(TOUCH_TARGET_MIN_PX);
  });
});
