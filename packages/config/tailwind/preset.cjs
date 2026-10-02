/**
 * Preset de Tailwind compartido (mobile-first, RNF-01) + sistema visual «Brisa Marina»
 * (docs/SRS.md §7 · RepoTecnico/Manual_Identidad_Visual.md v2.0.0).
 * Breakpoints: móvil <768 / tablet 768–1024 / desktop >1024.
 * Áreas táctiles mínimas de 44px (utilidades `*-touch`).
 *
 * Rediseño 2026-10 (sustituye a «Mediterráneo editorial»): registro luminoso y aéreo —
 * porcelana fría (`mist`), azur vívido para la acción (`azure`), marino profundo para el
 * registro oscuro y la suite de administración AdminLTE (`navy`), coral para la atención
 * (`coral`) y perla/ámbar como detalle premium. Todos los pares están medidos con
 * `scripts/design/contrast-audit.mjs` (WCAG 2.1 AA mínimo).
 *
 * IMPORTANTE: los breakpoints y el táctil reflejan las constantes de `@hotel/shared`
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
      // Paleta de marca «Brisa Marina» (Manual_Identidad_Visual.md v2.0.0). Este objeto y el
      // espejo `apps/web/src/lib/a11y/palette.ts` son UN SOLO origen de verdad: el test
      // `a11y.test.ts` los compara y se pone rojo si divergen.
      colors: {
        // — Fondos luminosos (registro aéreo) —
        mist: "#F4F9FC", // lienzo de página (porcelana fría)
        "mist-2": "#E6F0F6", // bandas, filas alternas, estados suaves
        shell: "#FFFFFF", // tarjetas, formularios, modales
        // — Texto —
        ink: "#101F2C", // texto principal (16,74:1 sobre shell)
        "ink-soft": "#41566A", // texto secundario (7,60:1 sobre shell)
        // — Marca / acción (azur vívido) —
        azure: "#0F6C9C", // acción primaria, enlaces, foco (5,76:1 con blanco)
        "azure-deep": "#0A4F75", // hover y pulsado (8,79:1 con blanco)
        // — Registro oscuro (hero, pie, suite de administración AdminLTE) —
        navy: "#0E2A3F", // superficie oscura: 14,77:1 con shell
        "navy-soft": "#1A4160", // superficie oscura secundaria / hover: 10,67:1 con shell
        pearl: "#C3D4E0", // detalle premium SOLO sobre oscuro (9,72:1 sobre navy)
        // — Acento de atención (coral) —
        coral: "#C4522C", // relleno de atención con texto blanco (4,57:1)
        "coral-text": "#A34222", // acento como texto (6,25:1 sobre shell)
        // — Premium sobre claro y estados de habitación —
        amber: "#B98324", // detalle sobre claro, con `ink` encima (5,05:1)
        fern: "#276E4C", // etiqueta «disponible» (6,14:1 con blanco; 5,04:1 sobre su tinte al 10 %)
        // — Bordes —
        line: "#DBE7EF", // filetes decorativos (no controles)
        "line-strong": "#6B8296", // frontera de controles (WCAG 1.4.11): 3,45–3,99:1
        // — Estados semánticos (pares medidos ≥ 4,5:1) —
        success: "#1F7A4D",
        "success-bg": "#E2F2E9",
        warning: "#8A5F0C",
        "warning-bg": "#FBF0D6",
        error: "#B3261E",
        "error-bg": "#FAE5E3",
        info: "#0F6380",
        "info-bg": "#E0EFF5",
      },
      fontFamily: {
        // Tipografías de marca «Brisa Marina»: serif elegante (display) + geométrica fresca (UI).
        // Las DOS publican el subconjunto `cyrillic`, así que el locale RU queda cubierto por las
        // fuentes de marca sin cascada por glifo (ver `cyrillic-fonts.test.ts`).
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-manrope)", "system-ui", "-apple-system", "sans-serif"],
      },
      // Escala tipográfica con clamp (móvil → desktop, docs/SRS.md §7).
      fontSize: {
        display: [
          "clamp(2.8rem, 1.7rem + 4.4vw, 5rem)",
          { lineHeight: "0.98", letterSpacing: "-0.03em" },
        ],
        h1: ["clamp(2.3rem, 1.55rem + 3.2vw, 4.1rem)", { lineHeight: "1.04", letterSpacing: "-0.02em" }],
        h2: ["clamp(1.6rem, 1.25rem + 1.6vw, 2.2rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        h3: ["1.3rem", { lineHeight: "1.2" }],
        h4: ["1.075rem", { lineHeight: "1.3" }],
        "body-lg": ["1.1875rem", { lineHeight: "1.55" }],
        body: ["1.0625rem", { lineHeight: "1.5" }],
        "body-sm": ["0.95rem", { lineHeight: "1.5" }],
        small: ["0.9rem", { lineHeight: "1.45" }],
        caption: ["0.82rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        overline: ["0.78rem", { lineHeight: "1.4", letterSpacing: "0.14em" }],
        micro: ["0.78rem", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        code: ["0.9rem", { lineHeight: "1.45" }],
      },
      borderRadius: {
        "brand-xs": "6px",
        brand: "16px",
        "brand-sm": "10px",
        "brand-lg": "22px",
        pill: "9999px",
      },
      // Elevación «aérea»: sombras frías y suaves teñidas con el marino/azur de marca.
      boxShadow: {
        card: "0 1px 2px rgba(14,42,63,0.05), 0 4px 12px rgba(15,108,156,0.07)",
        "card-hover": "0 12px 28px rgba(14,42,63,0.12)",
        modal: "0 24px 64px rgba(10,42,63,0.22)",
      },
      maxWidth: { prose: "66ch" },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      spacing: { touch: "44px" },
      transitionTimingFunction: { brand: "cubic-bezier(.21,.68,.27,.99)" },
    },
  },
};
