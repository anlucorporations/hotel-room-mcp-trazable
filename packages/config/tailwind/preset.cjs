/**
 * Preset de Tailwind compartido (mobile-first, RNF-01).
 * Breakpoints: móvil <768 / tablet 768–1024 / desktop >1024.
 * Áreas táctiles mínimas de 44px (utilidades `*-touch`).
 *
 * IMPORTANTE: estos valores reflejan las constantes de `@hotel/shared`
 * (`BREAKPOINT_TABLET_PX`, `BREAKPOINT_DESKTOP_PX`, `TOUCH_TARGET_MIN_PX`). Al ser un módulo
 * CommonJS de build no puede importarlas; un test guardián en `@hotel/shared` evita la
 * divergencia silenciosa.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    screens: {
      tablet: "768px",
      desktop: "1024px",
    },
    extend: {
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      spacing: { touch: "44px" },
    },
  },
};
