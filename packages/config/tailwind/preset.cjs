/**
 * Preset de Tailwind compartido (mobile-first, RNF-01) + sistema visual «Mediterráneo
 * editorial» (DISEÑO-UX §2).
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
      // Paleta de marca (DISEÑO-UX §2.1). Contraste verificado en el doc.
      colors: {
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
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "system-ui", "-apple-system", "sans-serif"],
      },
      // Escala tipográfica con clamp (móvil → desktop, DISEÑO-UX §2.2).
      fontSize: {
        h1: ["clamp(2.3rem, 1.55rem + 3.2vw, 4.1rem)", { lineHeight: "1.04", letterSpacing: "-0.02em" }],
        h2: ["clamp(1.6rem, 1.25rem + 1.6vw, 2.2rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        h3: ["1.3rem", { lineHeight: "1.2" }],
        body: ["1.0625rem", { lineHeight: "1.5" }],
        small: ["0.9rem", { lineHeight: "1.45" }],
        micro: ["0.78rem", { lineHeight: "1.4", letterSpacing: "0.04em" }],
      },
      borderRadius: {
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
