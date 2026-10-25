/**
 * Preset de Tailwind compartido (mobile-first, RNF-01) + sistema visual «Brisa Marina»
 * (docs/SRS.md §7 · RepoTecnico/Manual_Identidad_Visual.md v2.0.0).
 * Breakpoints: móvil <768 / tablet 768–1024 / desktop >1024.
 * Áreas táctiles mínimas de 44px (utilidades `*-touch`).
 *
 * Identidad 2026-10-23: «Cal & Sal» en la suite pública (caliza, azul mar, terracota, olivo) y
 * «Posidonia» en la suite administrativa (`/admin/**`, scope `.admin-surface`: verde-teal,
 * agua, arena y coral). Todos los pares están medidos en `RepoTecnico/propuestas_v3_identidad/`.
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
      // Identidad por superficie (2026-10-23):
      //   · suite pública → «Cal & Sal» (A): caliza cálida, azul mar, terracota, olivo.
      //   · suite administrativa (/admin/**) → «Posidonia» (B): verde-teal, agua, arena/coral,
      //     aplicada por `app/admin-surface.css` dentro del scope `.admin-surface` (sin duplicar
      //     el preset: los guardianes siguen midiendo la identidad pública, la de referencia).
      colors: {
        // — Fondos luminosos (caliza) —
        mist: "#F8F3E9", // lienzo de página (caliza tibia)
        "mist-2": "#EFE7D6", // bandas, filas alternas, sidebar claro
        shell: "#FFFFFF", // tarjetas, formularios, modales
        arena: "#E9DDC8", // NUEVO: superficie elevada cálida / hover del sidebar
        // — Texto —
        ink: "#15222C", // texto principal (16,19:1 sobre shell)
        "ink-soft": "#495764", // texto secundario (7,42:1 sobre shell)
        // — Marca / acción (azul mar) —
        azure: "#0B5C74", // acción primaria, enlaces, foco (7,51:1 con blanco)
        "azure-deep": "#084659", // hover y pulsado (10,34:1 con blanco)
        // — Registro oscuro (hero, pie, velo, AdminLTE) —
        navy: "#0F2833", // superficie oscura (15,31:1 con shell)
        "navy-soft": "#1A3B49", // superficie oscura secundaria / hover (11,89:1 con shell)
        pearl: "#D9E8EC", // detalle premium SOLO sobre oscuro (12,18:1 sobre navy)
        // — Acento de atención (terracota) —
        coral: "#AE4E2A", // relleno de atención con texto blanco (5,35:1)
        "coral-text": "#8F3D1E", // acento como texto (7,36:1 sobre shell)
        // — Premium sobre claro y estados de habitación —
        amber: "#9A6A12", // detalle premium (Suite) con texto blanco (4,73:1)
        fern: "#56682F", // etiqueta «disponible» (6,15:1 con blanco)
        // — Bordes —
        line: "#E4D9C5", // filetes decorativos (no controles)
        "line-strong": "#8B7A62", // frontera de controles (WCAG 1.4.11): 3,38–4,15:1
        // — Estados semánticos (pares medidos ≥ 4,5:1) —
        success: "#1C6E48",
        "success-bg": "#E2F0E8",
        warning: "#875A0B",
        "warning-bg": "#F9EFD4",
        error: "#A62A1F",
        "error-bg": "#F7E3DF",
        info: "#1E6273",
        "info-bg": "#E1EDF1",
      },
      fontFamily: {
        // Identidad pública «Cal & Sal»: Cormorant Garamond (display) + Onest (UI).
        // La suite administrativa cambia estas variables a Spectral + Inter Tight en su scope
        // (`.admin-surface`), sin tocar el preset ni los componentes. Las CUATRO familias
        // publican cirílico (ver `cyrillic-fonts.test.ts`).
        display: ["var(--font-display)", "Iowan Old Style", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
      // Escala tipográfica con clamp (móvil → desktop, docs/SRS.md §7).
      fontSize: {
        display: [
          "clamp(2.75rem, 1.85rem + 4.2vw, 5rem)",
          { lineHeight: "0.98", letterSpacing: "-0.02em" },
        ],
        h1: ["clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)", { lineHeight: "1.03", letterSpacing: "-0.015em" }],
        h2: ["clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        h3: ["1.3125rem", { lineHeight: "1.25" }],
        h4: ["1.0625rem", { lineHeight: "1.35" }],
        "body-lg": ["1.1875rem", { lineHeight: "1.6" }],
        body: ["1.0625rem", { lineHeight: "1.55" }],
        "body-sm": ["0.9375rem", { lineHeight: "1.55" }],
        small: ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        overline: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.16em" }],
        micro: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.04em" }],
        code: ["0.875rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        "brand-xs": "6px",
        brand: "18px",
        "brand-sm": "12px",
        "brand-lg": "28px",
        pill: "9999px",
      },
      // Elevación «cálida»: sombras difusas teñidas con la tinta y la arena de marca.
      boxShadow: {
        card: "0 1px 2px rgba(21,34,44,0.05), 0 8px 24px rgba(139,122,98,0.12)",
        "card-hover": "0 16px 36px rgba(21,34,44,0.14)",
        modal: "0 28px 72px rgba(15,40,51,0.24)",
      },
      maxWidth: { prose: "66ch" },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      spacing: { touch: "44px" },
      transitionTimingFunction: { brand: "cubic-bezier(.21,.68,.27,.99)" },
    },
  },
};
