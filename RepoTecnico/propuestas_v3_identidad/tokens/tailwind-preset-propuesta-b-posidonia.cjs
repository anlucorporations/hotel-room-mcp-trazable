/**
 * CANDIDATO — preset de Tailwind para la propuesta B «Posidonia».
 *
 * NO se importa en paralelo al preset real: si esta propuesta se elige, estos valores SUSTITUYEN
 * los de `packages/config/tailwind/preset.cjs` (mismo nombre de token, valor nuevo + agua).
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
        "mist": "#F2F8F7",
        "mist-2": "#E3EFEE",
        "shell": "#FFFFFF",
        "agua": "#0C7A87",
        "ink": "#0C2226",
        "ink-soft": "#44605F",
        "azure": "#0B6A5A",
        "azure-deep": "#074B40",
        "navy": "#052528",
        "navy-soft": "#0A3A3D",
        "pearl": "#BFD8D4",
        "coral": "#B44D33",
        "coral-text": "#963C24",
        "amber": "#C9A66B",
        "fern": "#2F7A58",
        "line": "#D5E5E1",
        "line-strong": "#5C7B76",
        "success": "#196A45",
        "success-bg": "#DFF0E7",
        "warning": "#855A0C",
        "warning-bg": "#F9EFD4",
        "error": "#A3291E",
        "error-bg": "#F8E3DF",
        "info": "#0C6673",
        "info-bg": "#DEEEF1"
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
            "lineHeight": 1,
            "letterSpacing": "-0.03em",
            "fontWeight": 600
          }
        ],
        "h1": [
          "clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)",
          {
            "lineHeight": 1.05,
            "letterSpacing": "-0.025em",
            "fontWeight": 600
          }
        ],
        "h2": [
          "clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)",
          {
            "lineHeight": 1.12,
            "letterSpacing": "-0.015em",
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
            "lineHeight": 1.5,
            "letterSpacing": "0",
            "fontWeight": 400
          }
        ],
        "small": [
          "0.875rem",
          {
            "lineHeight": 1.45,
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
            "letterSpacing": "0.12em",
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
        "brand-xs": "4px",
        "brand": "14px",
        "brand-sm": "8px",
        "brand-lg": "20px",
        "pill": "9999px"
      },
      "boxShadow": {
        "card": "0 1px 2px rgba(5,37,40,.06), 0 8px 22px rgba(11,106,90,.10)",
        "card-hover": "0 14px 32px rgba(5,37,40,.16)",
        "modal": "0 26px 68px rgba(5,37,40,.26)"
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
