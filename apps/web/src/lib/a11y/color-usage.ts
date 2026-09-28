import { NEUTRAL_COLOR_TOKENS, NEUTRAL_HEX, PALETTE } from "./palette";

/**
 * Extracción y clasificación de las utilidades de color que la interfaz usa **de verdad**.
 *
 * Nace del hallazgo H-21 de la auditoría: la «certificación WCAG» se medía contra colores
 * (`emerald-700`, `red-600`…) que no existen en el preset, así que no certificaba nada del
 * producto real. Aquí se leen los `className` de los componentes y se comprueba, sobre la paleta
 * real, (a) que ningún token es inventado y (b) que el par texto/fondo de cada elemento tiene
 * contraste suficiente.
 */

/** Propiedades de color que pintan TEXTO (foreground). */
const FOREGROUND_PROPERTIES = [
  "text",
  "fill",
  "stroke",
  "decoration",
  "placeholder",
  "caret",
  "accent",
] as const;

/** Propiedades de color que pintan FONDO (background, incluidos los topes de degradado). */
const BACKGROUND_PROPERTIES = ["bg", "from", "via", "to"] as const;

/** Utilidades con forma `propiedad-color` que NO son un color (estructura, tamaño, estilo). */
const NON_COLOR_TOKENS = new Set([
  "collapse",
  "separate",
  "solid",
  "dashed",
  "dotted",
  "double",
  "none",
  "hidden",
  "inherit",
  "nowrap",
  "wrap",
  "pretty",
  "balance",
  "clip",
  "ellipsis",
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "h1",
  "h2",
  "h3",
  "h4",
  "body",
  // Niveles de la escala tipográfica (`fontSize` del preset) que, sin esta lista, el escáner
  // confundía con colores: `text-caption` y `text-body-lg` se leían como «color desconocido».
  // El guardián de `a11y.test.ts` deriva esta lista del preset real, así que un nivel nuevo
  // tampoco podrá colarse.
  "display",
  "body-lg",
  "body-sm",
  "caption",
  "overline",
  "code",
  "small",
  "micro",
  "gradient-to-t",
  "gradient-to-tr",
  "gradient-to-r",
  "gradient-to-br",
  "gradient-to-b",
  "gradient-to-bl",
  "gradient-to-l",
  "gradient-to-tl",
  "opacity-0",
  "opacity-50",
]);

/** Propiedades que existen como utilidad pero cuya medida de contraste no es 4.5:1 de texto. */
const NON_TEXT_PROPERTIES = new Set(["border", "ring", "divide", "outline", "shadow"]);

export type ColorRole = "foreground" | "background" | "other";

export interface ColorUtility {
  /** Utilidad tal cual aparece en el código, p. ej. `hover:text-sea-deep`. */
  readonly raw: string;
  /** Variable(es) de Tailwind que la preceden (`hover`, `focus-visible`, `tablet`…). */
  readonly variants: readonly string[];
  /** Token de color, p. ej. `sea-deep`, `white`. */
  readonly token: string;
  /** Opacidad declarada (`bg-sea/10` → 10), o `null` si no lleva modificador. */
  readonly opacityPercent: number | null;
  readonly role: ColorRole;
  /** `true` si el token no es de la paleta de marca ni un neutro admitido (color inventado). */
  readonly unknown: boolean;
}

/**
 * Captura utilidades de color con sus variantes. No es un parser de Tailwind completo: cubre las
 * formas que el repositorio usa (variantes encadenadas, modificador de opacidad y utilidades de
 * borde por lado) e ignora los valores arbitrarios entre corchetes, que se revisan a mano.
 */
const COLOR_UTILITY =
  /(?<![a-zA-Z0-9_-])((?:[a-z-]+:)*)((?:text|bg|border|ring|divide|outline|shadow|fill|stroke|decoration|placeholder|caret|accent|from|via|to)-[a-z][a-z0-9-]*(?:\/\d{1,3})?)(?![a-zA-Z0-9_[-])/g;

/**
 * Extrae los fragmentos de un fichero fuente donde puede haber utilidades de color:
 *
 *  1. Los atributos `className` (comillas simples, dobles y plantillas).
 *  2. **Cualquier otro literal de cadena** que contenga una utilidad de color: las constantes de
 *     estilo (`const DANGER = "bg-… text-…"`), los ternarios y las listas de clases son tan reales
 *     como un atributo, y quedaban fuera del guardián (lo midió la verificación de M7: 92 de 629
 *     utilidades, el 14,6 % del producto, no se estaban comprobando).
 */
export function extractClassAttributes(source: string): string[] {
  const found: string[] = [];
  const push = (value: string | undefined): void => {
    if (value !== undefined && value.length > 0) found.push(value);
  };

  const attributePatterns = [
    /className="([^"]*)"/g,
    /className='([^']*)'/g,
    /className=\{`([^`]*)`\}/g,
  ];
  for (const pattern of attributePatterns) {
    for (const match of source.matchAll(pattern)) push(match[1]);
  }

  // Resto de literales de cadena del fichero, solo si contienen pinta de utilidad de color.
  const hasColorUtility = new RegExp(COLOR_UTILITY.source);
  for (const match of source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const literal = match[1] ?? match[2] ?? match[3];
    if (literal !== undefined && hasColorUtility.test(literal)) push(literal);
  }
  return found;
}

const roleOf = (property: string): ColorRole => {
  if ((FOREGROUND_PROPERTIES as readonly string[]).includes(property)) return "foreground";
  if ((BACKGROUND_PROPERTIES as readonly string[]).includes(property)) return "background";
  return "other";
};

/**
 * Normaliza la utilidad a `(propiedad, token)`. Resuelve las formas que no son `propiedad-color`
 * directas: borde por lado (`border-t-sea`) y ancho/offset de anillo (`ring-2`, `ring-offset-2`),
 * devolviendo `null` cuando la utilidad no pinta ningún color.
 */
function splitUtility(base: string): { property: string; token: string } | null {
  const [property, ...rest] = base.split("-");
  if (property === undefined || rest.length === 0) return null;
  // `ring-offset-2`, `ring-2`: estructura, no color.
  if (property === "ring" && (rest[0] === "offset" || /^\d+$/.test(rest[0]!))) return null;
  // `bg-gradient-to-br`: la dirección del degradado, no un color.
  if (property === "bg" && rest[0] === "gradient") return null;
  // `shadow-card`, `shadow-modal`: elevación, no color.
  if (property === "shadow") return null;
  // `border-t-sea` / `divide-x-sea`: el color va después del lado.
  if (rest.length > 1 && ["t", "b", "l", "r", "x", "y"].includes(rest[0]!)) {
    return { property, token: rest.slice(1).join("-") };
  }
  // `border-b`, `border-y`: lado sin color (estructura). No pinta ningún color.
  if (rest.length === 1 && ["t", "b", "l", "r", "x", "y"].includes(rest[0]!)) return null;
  return { property, token: rest.join("-") };
}

/** Clasifica cada utilidad de color de un fragmento de clases. */
export function parseColorUtilities(classes: string): ColorUtility[] {
  const utilities: ColorUtility[] = [];
  for (const match of classes.matchAll(COLOR_UTILITY)) {
    const variants = (match[1] ?? "").split(":").filter(Boolean);
    const base = match[2]!;
    const slash = base.indexOf("/");
    const withoutOpacity = slash === -1 ? base : base.slice(0, slash);
    const opacityPercent = slash === -1 ? null : Number(base.slice(slash + 1));
    const split = splitUtility(withoutOpacity);
    if (split === null) continue;
    const { property, token } = split;
    if (NON_COLOR_TOKENS.has(token) || /^\d+$/.test(token)) continue;
    utilities.push({
      raw: `${variants.map((v) => `${v}:`).join("")}${base}`,
      variants,
      token,
      opacityPercent,
      role: roleOf(property),
      unknown: !isKnownColorToken(token),
    });
  }
  return utilities;
}

/** ¿El token es un color de la paleta de marca o un neutro admitido? */
export function isKnownColorToken(token: string): boolean {
  return token in PALETTE || NEUTRAL_COLOR_TOKENS.includes(token);
}

/** ¿La utilidad pertenece a una propiedad cuyo contraste mínimo no es el de texto (4.5:1)? */
export function isNonTextUtility(utility: ColorUtility): boolean {
  const property = utility.raw.split(":").pop()!.split("-")[0]!;
  return NON_TEXT_PROPERTIES.has(property);
}

/** Hex del token (paleta de marca o neutro admitido). */
export function tokenHex(token: string): string | null {
  if (token in PALETTE) return PALETTE[token as keyof typeof PALETTE];
  return NEUTRAL_HEX[token] ?? null;
}

const HEX = (value: string): { r: number; g: number; b: number } => {
  const clean = value.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

/** Mezcla un color con opacidad sobre un fondo opaco (composición alfa estándar). */
export function blendOver(
  foregroundHex: string,
  backgroundHex: string,
  opacityPercent: number | null,
): string {
  if (opacityPercent === null || opacityPercent >= 100) return foregroundHex;
  const alpha = Math.max(0, opacityPercent) / 100;
  const fg = HEX(foregroundHex);
  const bg = HEX(backgroundHex);
  const mix = (a: number, b: number): number => Math.round(a * alpha + b * (1 - alpha));
  const hex = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${hex(mix(fg.r, bg.r))}${hex(mix(fg.g, bg.g))}${hex(mix(fg.b, bg.b))}`;
}

/** Control de formulario con su clase de estilo resuelta (Fase A.2 · hallazgo H-7). */
export interface FormControlSource {
  readonly tag: "input" | "select" | "textarea";
  /**
   * Clase aplicada al control: el literal del propio JSX o el valor de la constante de módulo
   * (`const FIELD = "…"`) cuando se usa `className={FIELD}`. `null` si el control no declara clase.
   */
  readonly className: string | null;
}

/**
 * Extrae los controles de formulario de un fuente y **resuelve** su clase.
 *
 * Existe para poder verificar la **frontera de los controles** (WCAG 2.1 · 1.4.11): el borde es lo
 * único que identifica un `input`/`select`/`textarea` sobre el lienzo, así que debe alcanzar 3:1.
 * Sin resolver las constantes (`FIELD`) el guardián sería ciego justo en la mayoría de los campos
 * del back-office, que es donde vive el hallazgo H-7.
 */
export function extractFormControls(source: string): FormControlSource[] {
  /** Constantes de cadena de nivel de módulo, para resolver `className={FIELD}`. */
  const constants = new Map<string, string>();
  for (const match of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]*)"/g)) {
    constants.set(match[1]!, match[2]!);
  }

  const controls: FormControlSource[] = [];
  const opening = /<(input|select|textarea)\b/g;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(source))) {
    // Se recorre la etiqueta hasta su `>` de cierre, respetando cadenas y llaves anidadas.
    let index = match.index + match[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; index < source.length; index += 1) {
      const char = source[index]!;
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) break;
    }
    const tag = source.slice(match.index, index + 1);

    const attribute = /className=(?:"([^"]*)"|\{\s*"([^"]*)"\s*\}|\{\s*([A-Za-z_$][\w$]*)\s*\})/.exec(tag);
    const className =
      attribute === null
        ? null
        : (attribute[1] ?? attribute[2] ?? constants.get(attribute[3]!) ?? null);

    controls.push({ tag: match[1] as FormControlSource["tag"], className });
  }
  return controls;
}
