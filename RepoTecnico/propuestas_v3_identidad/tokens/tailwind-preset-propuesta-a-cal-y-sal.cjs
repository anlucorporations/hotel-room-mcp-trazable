/**
 * CANDIDATO — preset de Tailwind para la propuesta A «Cal & Sal».
 *
 * NO se importa en paralelo al preset real: si esta propuesta se elige, estos valores SUSTITUYEN
 * los de `packages/config/tailwind/preset.cjs` (mismo nombre de token, valor nuevo + arena).
 * Generado por `scripts/design/proposals-v3.mjs`; los comentarios del preset original se pierden
 * a propósito en este candidato. La fuente de verdad de la propuesta es
 * `RepoTecnico/propuestas_v3_identidad/`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  "theme": {
    "screens": {
      "tablet": "768px",
      "desktop": "1024px"
    },
    "extend": {
      "colors": {
        "mist": "#F8F3E9",
        "mist-2": "#EFE7D6",
        "shell": "#FFFFFF",
        "arena": "#E9DDC8",
        "ink": "#15222C",
        "ink-soft": "#495764",
        "azure": "#0B5C74",
        "azure-deep": "#084659",
        "navy": "#0F2833",
        "navy-soft": "#1A3B49",
        "pearl": "#D9E8EC",
        "coral": "#AE4E2A",
        "coral-text": "#8F3D1E",
        "amber": "#9A6A12",
        "fern": "#56682F",
        "line": "#E4D9C5",
        "line-strong": "#8B7A62",
        "success": "#1C6E48",
        "success-bg": "#E2F0E8",
        "warning": "#875A0B",
        "warning-bg": "#F9EFD4",
        "error": "#A62A1F",
        "error-bg": "#F7E3DF",
        "info": "#1E6273",
        "info-bg": "#E1EDF1"
      },
      "fontFamily": {
        "display": [
          "var(--font-display)",
          "\"Iowan Old Style\"",
          "Georgia",
          "serif"
        ],
        "sans": [
          "var(--font-sans)",
          "\"Segoe UI\"",
          "system-ui",
          "-apple-system",
          "sans-serif"
        ]
      },
      "fontSize": {
        "display": [
          "clamp(2.75rem, 1.85rem + 4.2vw, 5rem)",
          {
            "lineHeight": 0.98,
            "letterSpacing": "-0.02em",
            "fontWeight": 600
          }
        ],
        "h1": [
          "clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)",
          {
            "lineHeight": 1.03,
            "letterSpacing": "-0.015em",
            "fontWeight": 600
          }
        ],
        "h2": [
          "clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)",
          {
            "lineHeight": 1.1,
            "letterSpacing": "-0.01em",
            "fontWeight": 600
          }
        ],
        "h3": [
          "1.3125rem",
          {
            "lineHeight": 1.25,
            "letterSpacing": "0",
            "fontWeight": 600
          }
        ],
        "h4": [
          "1.0625rem",
          {
            "lineHeight": 1.35,
            "letterSpacing": "0",
            "fontWeight": 600
          }
        ],
        "body-lg": [
          "1.1875rem",
          {
            "lineHeight": 1.6,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ],
        "body": [
          "1.0625rem",
          {
            "lineHeight": 1.55,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ],
        "body-sm": [
          "0.9375rem",
          {
            "lineHeight": 1.55,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ],
        "small": [
          "0.875rem",
          {
            "lineHeight": 1.5,
            "letterSpacing": "0",
            "fontWeight": 500
          }
        ],
        "caption": [
          "0.8125rem",
          {
            "lineHeight": 1.4,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ],
        "overline": [
          "0.75rem",
          {
            "lineHeight": 1.4,
            "letterSpacing": "0.16em",
            "fontWeight": 600
          }
        ],
        "micro": [
          "0.75rem",
          {
            "lineHeight": 1.4,
            "letterSpacing": "0.04em",
            "fontWeight": 500
          }
        ],
        "code": [
          "0.875rem",
          {
            "lineHeight": 1.4,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ]
      },
      "borderRadius": {
        "brand-xs": "6px",
        "brand": "18px",
        "brand-sm": "12px",
        "brand-lg": "28px",
        "pill": "9999px"
      },
      "boxShadow": {
        "card": "0 1px 2px rgba(21,34,44,.05), 0 8px 24px rgba(139,122,98,.12)",
        "card-hover": "0 16px 36px rgba(21,34,44,.14)",
        "modal": "0 28px 72px rgba(15,40,51,.24)"
      },
      "maxWidth": {
        "prose": "66ch"
      },
      "minHeight": {
        "touch": "44px"
      },
      "minWidth": {
        "touch": "44px"
      },
      "spacing": {
        "touch": "44px"
      },
      "transitionTimingFunction": {
        "brand": "cubic-bezier(.21,.68,.27,.99)"
      }
    }
  }
};
