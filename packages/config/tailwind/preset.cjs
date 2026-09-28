/**
 * Preset de Tailwind compartido (mobile-first, RNF-01) + sistema visual «Mediterráneo
 * editorial» (docs/SRS.md §7).
 * Breakpoints: móvil <768 / tablet 768–1024 / desktop >1024.
 * Áreas táctiles mínimas de 44px (utilidades `*-touch`).
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
      // Paleta de marca (docs/SRS.md §7 + RepoTecnico/propuesta_imagen_visual.md). Los 12 tokens
      // originales NO cambian; los nuevos son ADITIVOS (evolución aprobada del sistema visual,
      // 2026-09-27) y sus pares están medidos con `scripts/design/contrast-audit.mjs`.
      colors: {
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
        // — Registro oscuro editorial (propuesta «Marina Sol» adaptada) —
        ocean: "#0F2C3F", // superficie oscura (hero, pie, cabecera de administración): 13,42:1 con arena
        "ocean-soft": "#16455E", // superficie oscura secundaria / hover: 4,54:1 con champagne
        champagne: "#C5A880", // detalle premium SOLO sobre oscuro (6,39:1 sobre ocean)
        // — Frontera de controles (WCAG 2.1 · 1.4.11) —
        "line-strong": "#8F7F5F", // borde de input/select/textarea: 3,27–3,91:1 sobre sand/sand-2/shell
        // — Estados semánticos (pares medidos ≥ 4,5:1) —
        success: "#2F6B4F",
        "success-bg": "#E3EFE7",
        warning: "#8A5A12",
        "warning-bg": "#F7E9C9",
        error: "#9E2B1F",
        "error-bg": "#F8E3DE",
        info: "#14556B",
        "info-bg": "#DCEAF1",
      },
      fontFamily: {
        // Cascada cirílica (Fase B): ES/EN usan las fuentes de marca; el ruso toma el respaldo
        // glifo a glifo porque Fraunces no incluye cirílico y Hanken Grotesk solo el bloque
        // extendido. La decisión y la evidencia están en RepoTecnico/propuesta_imagen_visual.md §3.4.
        display: ["var(--font-fraunces)", "var(--font-playfair)", "Georgia", "serif"],
        sans: [
          "var(--font-hanken)",
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      // Escala tipográfica con clamp (móvil → desktop, docs/SRS.md §7 + §3.4 de la propuesta).
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
      boxShadow: {
        card: "0 1px 2px rgba(14,90,99,0.06), 0 2px 6px rgba(14,90,99,0.08)",
        "card-hover": "0 10px 24px rgba(14,90,99,0.14)",
        modal: "0 24px 60px rgba(8,66,74,0.24)",
      },
      maxWidth: { prose: "66ch" },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      spacing: { touch: "44px" },
      transitionTimingFunction: { brand: "cubic-bezier(.21,.68,.27,.99)" },
    },
  },
};
