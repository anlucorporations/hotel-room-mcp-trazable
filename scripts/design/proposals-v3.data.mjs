/**
 * Datos de las DOS propuestas de identidad visual v3 (`@visualUiUx`, 2026-10).
 *
 * Este fichero es la ÚNICA fuente de verdad de las propuestas: paletas por rol semántico,
 * tipografías (con cirílico verificado en Google Fonts), escalas, radios, elevación y los pares
 * texto/fondo que se miden con la misma matemática WCAG 2.1 que el producto
 * (`apps/web/src/lib/a11y/contrast.ts`). `proposals-v3.mjs` lo consume para generar las
 * previsualizaciones, los tokens, los presets de Tailwind y las tablas de contraste.
 *
 * Contexto real: el sistema vigente es «Brisa Marina» v2.0.0
 * (`packages/config/tailwind/preset.cjs`). Las propuestas **no renombran** los tokens de código
 * (`mist`, `shell`, `ink`, `azure`, `navy`, `pearl`, `coral`, `amber`, `fern`, `line`, estados):
 * cambian sus VALORES y añaden como mucho un token. Así la migración es de valores, no de API.
 *
 * Los nombres de identidad («Cal & Sal», «Posidonia») son de marca; los roles son de código.
 */

/**
 * @typedef {Object} Proposal
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} tagline
 * @property {string} concept
 * @property {string[]} personality
 * @property {Record<string,string>} palette
 * @property {Array<{token:string, role:string, use:string}>} roles
 * @property {Array<[string,string,string,number?]>} pairs
 * @property {Array<[string,string,string,number?]>} adminPairs
 * @property {Array<{fg:string,bg:string,alpha:number,base:string,where:string}>} veils
 * @property {Array<{fg:string,bg:string,where:string,why:string}>} prohibited
 * @property {Object} fonts
 * @property {Array<Object>} typeScale
 * @property {Object} radii
 * @property {Object} shadows
 * @property {"light"|"dark"} adminSkin
 * @property {Object} admin
 * @property {string} newToken
 * @property {Object} defaults
 * @property {Object} migration
 */

/** Escala tipográfica compartida: los valores que cambian son los de `display`…`h2` y el tracking. */
const TYPE_SCALE = [
  { key: "display", use: "Hero de la landing y portada de sección", px: "44–80", clamp: "clamp(2.75rem, 1.85rem + 4.2vw, 5rem)" },
  { key: "h1", use: "Título de página", px: "36–62", clamp: "clamp(2.25rem, 1.6rem + 2.9vw, 3.875rem)" },
  { key: "h2", use: "Sección", px: "26–38", clamp: "clamp(1.625rem, 1.3rem + 1.45vw, 2.375rem)" },
  { key: "h3", use: "Subtítulo / tarjeta destacada", px: "21–22", clamp: "1.3125rem" },
  { key: "h4", use: "Cabecera de tarjeta / bloque", px: "17–18", clamp: "1.0625rem" },
  { key: "body-lg", use: "Entradilla editorial", px: "19", clamp: "1.1875rem" },
  { key: "body", use: "Texto base (mínimo 17 px)", px: "17", clamp: "1.0625rem" },
  { key: "body-sm", use: "Tablas densas de personal", px: "15", clamp: "0.9375rem" },
  { key: "small", use: "Ayudas, etiquetas de formulario", px: "14", clamp: "0.875rem" },
  { key: "caption", use: "Metadatos, pie de foto", px: "13", clamp: "0.8125rem" },
  { key: "overline", use: "Eyebrow en mayúsculas", px: "12", clamp: "0.75rem" },
  { key: "micro", use: "Chips y etiquetas de estado", px: "12", clamp: "0.75rem" },
  { key: "code", use: "Hash, tokenId, direcciones", px: "14", clamp: "0.875rem" },
];

/** Radios base por propuesta (mapean a los tokens `brand-xs`/`brand-sm`/`brand`/`brand-lg`). */
const radiiA = { "brand-xs": 6, "brand-sm": 12, brand: 18, "brand-lg": 28, pill: 9999 };
const radiiB = { "brand-xs": 4, "brand-sm": 8, brand: 14, "brand-lg": 20, pill: 9999 };

/**
 * Propuesta A — «Cal & Sal».
 * Mediterráneo encalado: caliza cálida de lienzo, azul mar profundo para la acción, terracota para
 * la atención y olivo para lo disponible. AdminLTE en *light skin* («salón de luz»).
 * @type {Proposal}
 */
export const PROPOSAL_A = {
  id: "A",
  slug: "propuesta-a-cal-y-sal",
  name: "Cal & Sal",
  tagline: "Luz de cal, azul de mar.",
  concept:
    "El Mediterráneo encalado: pared de caliza tibia, sombra de arco, agua profunda y un tiesto de terracota al sol. " +
    "Fresco por la luz, no por el blanco frío: el lienzo es cálido y la fotografía manda. La marca suena a hotel " +
    "boutique de Alicante, no a panel de cripto.",
  personality: ["cálida", "editorial", "hospitalaria", "artesanal", "luminosa"],
  palette: {
    mist: "#F8F3E9", // lienzo de página (caliza)
    "mist-2": "#EFE7D6", // bandas, filas alternas, sidebar claro
    shell: "#FFFFFF", // tarjetas, formularios, modales
    arena: "#E9DDC8", // NUEVO: superficie elevada cálida / hover del sidebar
    ink: "#15222C", // texto principal
    "ink-soft": "#495764", // texto secundario
    azure: "#0B5C74", // acción primaria, enlaces, foco (azul mar)
    "azure-deep": "#084659", // hover / pulsado
    navy: "#0F2833", // superficie oscura: hero, pie, velo (noche marinera)
    "navy-soft": "#1A3B49", // superficie oscura secundaria / hover
    pearl: "#D9E8EC", // detalle premium SOLO sobre oscuro (sal)
    coral: "#AE4E2A", // relleno de atención (terracota) con texto blanco
    "coral-text": "#8F3D1E", // atención como texto sobre claro
    amber: "#9A6A12", // detalle premium sobre claro (azafrán), texto blanco encima
    fern: "#56682F", // estado «disponible» (olivo)
    line: "#E4D9C5", // filetes decorativos
    "line-strong": "#8B7A62", // frontera de controles (WCAG 1.4.11)
    success: "#1C6E48",
    "success-bg": "#E2F0E8",
    warning: "#875A0B",
    "warning-bg": "#F9EFD4",
    error: "#A62A1F",
    "error-bg": "#F7E3DF",
    info: "#1E6273",
    "info-bg": "#E1EDF1",
  },
  roles: [
    { token: "mist", role: "background", use: "Lienzo de página: la caliza tibia del patio" },
    { token: "mist-2", role: "background-alt", use: "Bandas, filas alternas, sidebar claro" },
    { token: "shell", role: "surface", use: "Tarjetas, formularios, modales, tabla" },
    { token: "arena", role: "surface-raised", use: "Superficie elevada, hover del sidebar, chips" },
    { token: "ink", role: "text-primary", use: "Texto principal (14,6:1 sobre caliza)" },
    { token: "ink-soft", role: "text-secondary", use: "Texto secundario, ayudas, migas" },
    { token: "azure", role: "interactive", use: "Acción primaria, enlaces, anillo de foco" },
    { token: "azure-deep", role: "interactive-hover", use: "Hover y pulsado de la acción" },
    { token: "navy", role: "surface-dark", use: "Hero, pie, velo del hero y pantalla de acceso" },
    { token: "navy-soft", role: "surface-dark-alt", use: "Superficie oscura secundaria y hover" },
    { token: "pearl", role: "premium-dark", use: "Detalle premium SOLO sobre oscuro (12,2:1)" },
    { token: "coral", role: "accent-fill", use: "Relleno de atención con texto blanco (5,4:1)" },
    { token: "coral-text", role: "accent-text", use: "Atención como texto sobre claro (7,4:1)" },
    { token: "amber", role: "premium-light", use: "Etiqueta premium (Suite) con texto blanco" },
    { token: "fern", role: "available", use: "Chip «disponible» / «libre» con texto blanco" },
    { token: "line", role: "border", use: "Filetes decorativos y separadores (no controles)" },
    { token: "line-strong", role: "border-strong", use: "Frontera de controles (≥3:1)" },
    { token: "success", role: "success", use: "Confirmación" },
    { token: "warning", role: "warning", use: "Aviso" },
    { token: "error", role: "error", use: "Error y bloqueo" },
    { token: "info", role: "info", use: "Información y ayuda" },
  ],
  pairs: [
    ["ink", "mist", "Texto principal sobre lienzo de caliza"],
    ["ink", "shell", "Texto principal sobre tarjeta"],
    ["ink", "mist-2", "Texto principal sobre banda cálida"],
    ["ink", "arena", "Texto principal sobre superficie arena"],
    ["ink-soft", "mist", "Texto secundario sobre lienzo"],
    ["ink-soft", "shell", "Texto secundario sobre tarjeta"],
    ["ink-soft", "mist-2", "Texto secundario sobre banda"],
    ["azure", "shell", "Enlace / acción sobre tarjeta"],
    ["azure", "mist", "Enlace sobre el lienzo"],
    ["shell", "azure", "Texto blanco sobre acción primaria"],
    ["shell", "azure-deep", "Texto blanco sobre acción en hover"],
    ["shell", "coral", "Texto blanco sobre relleno de atención"],
    ["coral-text", "shell", "Atención como texto sobre tarjeta"],
    ["coral-text", "mist", "Atención como texto sobre lienzo"],
    ["shell", "navy", "Texto blanco sobre superficie oscura"],
    ["mist", "navy", "Texto caliza sobre superficie oscura"],
    ["pearl", "navy", "Detalle sal sobre la noche"],
    ["shell", "navy-soft", "Texto blanco sobre oscuro secundario"],
    ["pearl", "navy-soft", "Detalle premium sobre oscuro secundario"],
    ["shell", "fern", "Texto blanco sobre «disponible»"],
    ["shell", "amber", "Texto blanco sobre etiqueta premium"],
    ["ink", "line", "Texto sobre separador (chips)"],
    ["line-strong", "shell", "Frontera de control sobre tarjeta", 3],
    ["line-strong", "mist", "Frontera de control sobre lienzo", 3],
    ["line-strong", "mist-2", "Frontera de control sobre banda", 3],
    ["success", "mist", "Confirmación como texto"],
    ["success", "success-bg", "Confirmación sobre su banda"],
    ["warning", "mist", "Aviso como texto"],
    ["warning", "warning-bg", "Aviso sobre su banda"],
    ["error", "mist", "Error como texto"],
    ["error", "error-bg", "Error sobre su banda"],
    ["info", "mist", "Información como texto"],
    ["info", "info-bg", "Información sobre su banda"],
    ["shell", "success", "Texto blanco sobre confirmación"],
    ["shell", "error", "Texto blanco sobre error"],
  ],
  adminPairs: [
    ["ink", "mist-2", "Texto del sidebar claro (AdminLTE light skin)"],
    ["ink-soft", "mist-2", "Etiquetas de sección del sidebar"],
    ["ink", "arena", "Hover del sidebar (arena con tinta)"],
    ["shell", "azure", "Entrada activa del sidebar (pastilla azul)"],
    ["ink", "shell", "Contenido del panel sobre tarjeta blanca"],
    ["ink-soft", "shell", "Migaja y metadatos del panel"],
  ],
  veils: [{ fg: "shell", bg: "navy", alpha: 0.7, base: "shell", where: "Titular del hero sobre velo de noche al 70 %" }],
  prohibited: [
    { fg: "ink", bg: "navy", where: "Texto tinta sobre superficie oscura", why: "Se pierde la jerarquía del registro oscuro" },
    { fg: "pearl", bg: "shell", where: "Sal como texto sobre blanco", why: "El detalle premium solo existe sobre oscuro" },
    { fg: "ink", bg: "amber", where: "Tinta sobre el relleno azafrán", why: "El relleno premium reclama texto blanco (4,73:1); la tinta se queda en 3,43:1" },
    { fg: "line", bg: "mist", where: "Filete decorativo como frontera de control", why: "Incumple WCAG 1.4.11 (mínimo 3:1)" },
  ],
  fonts: {
    display: {
      family: "Cormorant Garamond",
      stack: '"Cormorant Garamond", "Iowan Old Style", Georgia, serif',
      google: "Cormorant+Garamond:wght@500;600;700",
      variable: "--font-display",
      weights: [500, 600, 700],
      why: "Serif de alto contraste, aire editorial y curvas mediterráneas; publica cirílico (RU).",
    },
    ui: {
      family: "Onest",
      stack: 'Onest, "Segoe UI", system-ui, -apple-system, sans-serif',
      google: "Onest:wght@400;500;600;700",
      variable: "--font-sans",
      weights: [400, 500, 600, 700],
      why: "Geométrica humanista contemporánea, excelente en pantalla y densa en tablas; cirílico nativo.",
    },
  },
  typeScale: TYPE_SCALE.map((t) => ({
    ...t,
    weight:
      t.key === "display" || t.key === "h1" || t.key === "h2" || t.key === "h3" || t.key === "h4" || t.key === "overline"
        ? 600
        : t.key.startsWith("body") || t.key === "caption" || t.key === "code"
          ? 400
          : 500,
    lineHeight:
      t.key === "display" ? 0.98 : t.key === "h1" ? 1.03 : t.key === "h2" ? 1.1 : t.key === "h3" ? 1.25 : t.key === "h4" ? 1.35 : t.key === "body-lg" ? 1.6 : t.key === "body" ? 1.55 : t.key === "body-sm" ? 1.55 : t.key === "small" ? 1.5 : 1.4,
    letterSpacing:
      t.key === "display" ? "-0.02em" : t.key === "h1" ? "-0.015em" : t.key === "h2" ? "-0.01em" : t.key === "overline" ? "0.16em" : t.key === "micro" ? "0.04em" : "0",
    transform: t.key === "overline" ? "uppercase" : "none",
  })),
  radii: radiiA,
  shadows: {
    card: "0 1px 2px rgba(21,34,44,.05), 0 8px 24px rgba(139,122,98,.12)",
    "card-hover": "0 16px 36px rgba(21,34,44,.14)",
    modal: "0 28px 72px rgba(15,40,51,.24)",
  },
  motion: {
    ease: "cubic-bezier(.22,.68,.24,1)",
    hover: "translateY(-4px) y zoom de foto a 1.04",
    reveal: "revelado escalonado de 0,55 s como máximo",
  },
  adminSkin: "light",
  admin: {
    sidebarBg: "mist-2",
    sidebarText: "ink",
    sidebarMuted: "ink-soft",
    sidebarHover: "arena",
    sideActiveBg: "azure",
    sideActiveText: "shell",
    navbarBg: "shell",
    pageBg: "mist",
    headerBorder: "line",
    kpiBg: "shell",
    iconTile: "mist-2",
    mode: "AdminLTE 3 · light skin «salón de luz»",
  },
  newToken: "arena",
  defaults: { veilAlpha: 0.7, contentMax: "1200px", adminMax: "1440px", sidebar: "264px", sidebarMini: "72px", navbar: "64px", touch: "44px" },
  migration: {
    effort: "≈1,5–2 días-persona (incluye verificación)",
    shellChange: "Sí: el sidebar pasa a claro (clases de AdminLayout + guardián admin-shell).",
    files: "preset + palette + globals + layout (fuentes) + AdminLayout + docs + evidencias",
  },
};

/**
 * Propuesta B — «Posidonia».
 * Praderas de posidonia: verde-teal profundo, agua clara, arena y coral. AdminLTE en *dark skin*
 * («sala de máquinas»): el rail oscuro de siempre, con la marca nueva.
 * @type {Proposal}
 */
export const PROPOSAL_B = {
  id: "B",
  slug: "propuesta-b-posidonia",
  name: "Posidonia",
  tagline: "Frescura de fondo, control a la vista.",
  concept:
    "La pradera de posidonia bajo un agua transparente: verde-teal profundo, aguas claras y arena. " +
    "Más fría y energética que la A, con una lectura operativa impecable: el rail oscuro del back-office " +
    "separa el mando de la operación y el lienzo claro mantiene la frescura en el escaparate.",
  personality: ["fresca", "crisp", "sostenible", "precisa", "operativa"],
  palette: {
    mist: "#F2F8F7",
    "mist-2": "#E3EFEE",
    shell: "#FFFFFF",
    ink: "#0C2226",
    "ink-soft": "#44605F",
    azure: "#0B6A5A", // posidonia
    "azure-deep": "#074B40",
    navy: "#052528", // abismo
    "navy-soft": "#0A3A3D",
    pearl: "#BFD8D4",
    coral: "#B44D33",
    "coral-text": "#963C24",
    amber: "#C9A66B", // arena dorada
    fern: "#2F7A58", // disponible
    agua: "#0C7A87", // NUEVO: apoyo interactivo / datos
    line: "#D5E5E1",
    "line-strong": "#5C7B76",
    success: "#196A45",
    "success-bg": "#DFF0E7",
    warning: "#855A0C",
    "warning-bg": "#F9EFD4",
    error: "#A3291E",
    "error-bg": "#F8E3DF",
    info: "#0C6673",
    "info-bg": "#DEEEF1",
  },
  roles: [
    { token: "mist", role: "background", use: "Lienzo de página: bruma de agua clara" },
    { token: "mist-2", role: "background-alt", use: "Bandas, filas alternas, estados suaves" },
    { token: "shell", role: "surface", use: "Tarjetas, formularios, modales, tabla" },
    { token: "ink", role: "text-primary", use: "Texto principal (15,4:1 sobre bruma)" },
    { token: "ink-soft", role: "text-secondary", use: "Texto secundario, ayudas, migas" },
    { token: "azure", role: "interactive", use: "Acción primaria, enlaces, foco (posidonia)" },
    { token: "azure-deep", role: "interactive-hover", use: "Hover y pulsado" },
    { token: "agua", role: "interactive-secondary", use: "NUEVO: apoyo interactivo, gráficas y datos" },
    { token: "navy", role: "surface-dark", use: "Hero, pie, sidebar AdminLTE y velo" },
    { token: "navy-soft", role: "surface-dark-alt", use: "Superficie oscura secundaria y hover" },
    { token: "pearl", role: "premium-dark", use: "Detalle premium SOLO sobre oscuro (10,8:1)" },
    { token: "coral", role: "accent-fill", use: "Relleno de atención con texto blanco (5,2:1)" },
    { token: "coral-text", role: "accent-text", use: "Atención como texto sobre claro (7,1:1)" },
    { token: "amber", role: "premium-light", use: "Detalle arena: etiqueta premium con tinta encima" },
    { token: "fern", role: "available", use: "Chip «disponible» / «libre» con texto blanco" },
    { token: "line", role: "border", use: "Filetes decorativos y separadores" },
    { token: "line-strong", role: "border-strong", use: "Frontera de controles (≥3:1)" },
    { token: "success", role: "success", use: "Confirmación" },
    { token: "warning", role: "warning", use: "Aviso" },
    { token: "error", role: "error", use: "Error y bloqueo" },
    { token: "info", role: "info", use: "Información y ayuda" },
  ],
  pairs: [
    ["ink", "mist", "Texto principal sobre lienzo de bruma"],
    ["ink", "shell", "Texto principal sobre tarjeta"],
    ["ink", "mist-2", "Texto principal sobre banda"],
    ["ink-soft", "mist", "Texto secundario sobre lienzo"],
    ["ink-soft", "shell", "Texto secundario sobre tarjeta"],
    ["ink-soft", "mist-2", "Texto secundario sobre banda"],
    ["azure", "shell", "Enlace / acción sobre tarjeta"],
    ["azure", "mist", "Enlace sobre el lienzo"],
    ["agua", "shell", "Apoyo interactivo sobre tarjeta"],
    ["agua", "mist", "Apoyo interactivo sobre el lienzo"],
    ["shell", "azure", "Texto blanco sobre acción primaria"],
    ["shell", "azure-deep", "Texto blanco sobre acción en hover"],
    ["shell", "agua", "Texto blanco sobre apoyo interactivo"],
    ["shell", "coral", "Texto blanco sobre relleno de atención"],
    ["coral-text", "shell", "Atención como texto sobre tarjeta"],
    ["coral-text", "mist", "Atención como texto sobre lienzo"],
    ["shell", "navy", "Texto blanco sobre superficie oscura"],
    ["mist", "navy", "Texto bruma sobre superficie oscura"],
    ["pearl", "navy", "Detalle premium sobre el abismo"],
    ["shell", "navy-soft", "Texto blanco sobre oscuro secundario"],
    ["pearl", "navy-soft", "Detalle premium sobre oscuro secundario"],
    ["shell", "fern", "Texto blanco sobre «disponible»"],
    ["ink", "amber", "Etiqueta premium (tinta sobre arena)"],
    ["ink", "line", "Texto sobre separador (chips)"],
    ["line-strong", "shell", "Frontera de control sobre tarjeta", 3],
    ["line-strong", "mist", "Frontera de control sobre lienzo", 3],
    ["line-strong", "mist-2", "Frontera de control sobre banda", 3],
    ["success", "mist", "Confirmación como texto"],
    ["success", "success-bg", "Confirmación sobre su banda"],
    ["warning", "mist", "Aviso como texto"],
    ["warning", "warning-bg", "Aviso sobre su banda"],
    ["error", "mist", "Error como texto"],
    ["error", "error-bg", "Error sobre su banda"],
    ["info", "mist", "Información como texto"],
    ["info", "info-bg", "Información sobre su banda"],
    ["shell", "success", "Texto blanco sobre confirmación"],
    ["shell", "error", "Texto blanco sobre error"],
  ],
  adminPairs: [
    ["mist", "navy", "Texto del sidebar oscuro (AdminLTE dark skin)"],
    ["pearl", "navy", "Etiquetas de sección del sidebar"],
    ["shell", "azure", "Entrada activa del sidebar (pastilla posidonia)"],
    ["mist", "navy-soft", "Hover del sidebar"],
    ["ink", "shell", "Contenido del panel sobre tarjeta blanca"],
    ["ink-soft", "shell", "Migaja y metadatos del panel"],
  ],
  veils: [{ fg: "shell", bg: "navy", alpha: 0.7, base: "shell", where: "Titular del hero sobre velo de abismo al 70 %" }],
  prohibited: [
    { fg: "ink", bg: "navy", where: "Texto tinta sobre superficie oscura", why: "Se pierde la jerarquía del registro oscuro" },
    { fg: "pearl", bg: "shell", where: "Detalle premium sobre blanco", why: "Solo existe sobre oscuro" },
    { fg: "amber", bg: "shell", where: "Arena como texto sobre blanco", why: "Es una superficie: se usa con tinta encima" },
    { fg: "line", bg: "mist", where: "Filete decorativo como frontera de control", why: "Incumple WCAG 1.4.11 (mínimo 3:1)" },
  ],
  fonts: {
    display: {
      family: "Spectral",
      stack: 'Spectral, "Iowan Old Style", Georgia, serif',
      google: "Spectral:wght@500;600;700",
      variable: "--font-display",
      weights: [500, 600, 700],
      why: "Serif de pantalla con carácter contemporáneo y curva suave; cirílico nativo y buena lectura a sizes medios.",
    },
    ui: {
      family: "Inter Tight",
      stack: '"Inter Tight", "Segoe UI", system-ui, -apple-system, sans-serif',
      google: "Inter+Tight:wght@400;500;600;700",
      variable: "--font-sans",
      weights: [400, 500, 600, 700],
      why: "Grotesca de alta densidad, métricas ajustadas y cifras tabulares: ideal para tablas, KPIs y APK.",
    },
  },
  typeScale: TYPE_SCALE.map((t) => ({
    ...t,
    weight:
      t.key === "display" || t.key === "h1" || t.key === "h2" || t.key === "h3" || t.key === "h4" || t.key === "overline"
        ? 600
        : t.key.startsWith("body") || t.key === "caption" || t.key === "code"
          ? 400
          : 500,
    lineHeight:
      t.key === "display" ? 1.0 : t.key === "h1" ? 1.05 : t.key === "h2" ? 1.12 : t.key === "h3" ? 1.25 : t.key === "h4" ? 1.35 : t.key === "body-lg" ? 1.6 : t.key === "body" ? 1.55 : t.key === "body-sm" ? 1.5 : t.key === "small" ? 1.45 : 1.4,
    letterSpacing:
      t.key === "display" ? "-0.03em" : t.key === "h1" ? "-0.025em" : t.key === "h2" ? "-0.015em" : t.key === "overline" ? "0.12em" : t.key === "micro" ? "0.04em" : "0",
    transform: t.key === "overline" ? "uppercase" : "none",
  })),
  radii: radiiB,
  shadows: {
    card: "0 1px 2px rgba(5,37,40,.06), 0 8px 22px rgba(11,106,90,.10)",
    "card-hover": "0 14px 32px rgba(5,37,40,.16)",
    modal: "0 26px 68px rgba(5,37,40,.26)",
  },
  motion: {
    ease: "cubic-bezier(.2,.7,.2,1)",
    hover: "translateY(-3px) y cambio de borde, sin zoom agresivo",
    reveal: "revelado de 0,4 s, sin retardos en móvil",
  },
  adminSkin: "dark",
  admin: {
    sidebarBg: "navy",
    sidebarText: "mist",
    sidebarMuted: "pearl",
    sidebarHover: "navy-soft",
    sideActiveBg: "azure",
    sideActiveText: "shell",
    navbarBg: "shell",
    pageBg: "mist",
    headerBorder: "line",
    kpiBg: "shell",
    iconTile: "mist-2",
    mode: "AdminLTE 3 · dark skin «sala de máquinas»",
  },
  newToken: "agua",
  defaults: { veilAlpha: 0.7, contentMax: "1200px", adminMax: "1440px", sidebar: "264px", sidebarMini: "72px", navbar: "64px", touch: "44px" },
  migration: {
    effort: "≈1–1,5 días-persona (incluye verificación)",
    shellChange: "No: el sidebar sigue en registro oscuro; solo cambian los valores.",
    files: "preset + palette + globals + layout (fuentes) + docs + evidencias",
  },
};

export const PROPOSALS = [PROPOSAL_A, PROPOSAL_B];
