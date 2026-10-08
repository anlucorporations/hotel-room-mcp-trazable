import type { ChatMessage } from "./types";

/**
 * Saneador de PII (RNF-27). Se aplica a la conversación **justo antes de salir al proveedor del
 * modelo**, que es el único punto del sistema que envía texto libre del huésped a un tercero.
 *
 * Criterio de diseño: enmascara lo que se puede detectar de forma **fiable** (correo, teléfono,
 * documento de identidad, cuenta bancaria y presentaciones explícitas de nombre) y **no toca** lo
 * que el asistente necesita para funcionar: fechas `AAAAMMDD`, `tokenId`, direcciones de wallet,
 * importes, números de habitación ni códigos de resguardo. Un enmascarado agresivo rompería el flujo
 * de compra, que es peor que el riesgo que evita.
 *
 * LÍMITE DECLARADO: no es un detector semántico. Un nombre suelto en mitad de una frase
 * («el Sr. García de la 204») no se detecta; solo las presentaciones explícitas. Reduce el riesgo, no
 * lo elimina: por eso el proveedor elegido (Vertex AI, región UE) mantiene el dato dentro del
 * proyecto.
 */

/** Categorías enmascaradas; se registran sus recuentos para poder auditar sin guardar el dato. */
export type RedactionKind = "correo" | "telefono" | "documento" | "cuenta" | "nombre";

const MASK: Readonly<Record<RedactionKind, string>> = {
  correo: "[CORREO]",
  telefono: "[TELÉFONO]",
  documento: "[DOCUMENTO]",
  cuenta: "[CUENTA]",
  nombre: "[NOMBRE]",
};

export interface SanitizeResult {
  /** Texto con las categorías detectadas sustituidas por su máscara. */
  readonly text: string;
  /** Categorías encontradas, en orden de aparición y sin duplicados. */
  readonly redactions: readonly RedactionKind[];
}

/**
 * Reglas en orden: la cuenta bancaria va antes que el teléfono (contiene grupos de dígitos) y todas
 * usan lookarounds para no morder un fragmento de un número más largo (`tokenId`, fechas).
 */
const RULES: readonly { kind: RedactionKind; pattern: RegExp; replacement: string }[] = [
  {
    kind: "correo",
    pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
    replacement: MASK.correo,
  },
  {
    // IBAN español: ES + 2 dígitos de control + 5 grupos de 4 dígitos (22 en total).
    kind: "cuenta",
    pattern: /(?<!\w)ES\d{2}(?:[ -]?\d{4}){5}(?!\d)/gi,
    replacement: MASK.cuenta,
  },
  {
    // DNI (8 dígitos + letra) y NIE (X/Y/Z + 7 dígitos + letra).
    kind: "documento",
    pattern: /(?<![\p{L}\p{N}])(?:\d{8}[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])(?![\p{L}\p{N}])/gu,
    replacement: MASK.documento,
  },
  {
    // Teléfono español: fijo (9) o móvil (6/7), con prefijo +34 opcional y separadores.
    // Los lookarounds evitan morder parte de una fecha AAAAMMDD o de un tokenId.
    kind: "telefono",
    pattern: /(?<![\d+])(?:\+34[ -]?)?[679]\d{2}[ -]?\d{3}[ -]?\d{3}(?!\d)/g,
    replacement: MASK.telefono,
  },
  {
    // Presentaciones explícitas: «me llamo Carlos Ruiz», «Mi nombre es Ana», «Soy Marta».
    // El disparador va en un lookbehind (admitiendo mayúscula inicial) y la coincidencia es SOLO el
    // nombre, así que la frase sigue teniendo sentido para el modelo. El nombre debe empezar por
    // mayúscula: eso evita morder «Soy de Alicante» o «soy el dueño».
    kind: "nombre",
    pattern:
      /(?<=\b(?:[Mm]e llamo|[Mm]i nombre es|[Ss]oy)\s+)[A-ZÁÉÍÓÚÜÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÜÑ][\p{L}]+){0,2}/gu,
    replacement: MASK.nombre,
  },
];

/** Enmascara la PII detectable en un texto y devuelve también qué categorías aparecieron. */
export function sanitizePii(text: string): SanitizeResult {
  let output = text;
  const redactions: RedactionKind[] = [];

  for (const rule of RULES) {
    const matches = output.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    output = output.replace(rule.pattern, rule.replacement);
    redactions.push(rule.kind);
  }

  return { text: output, redactions };
}

export interface SanitizedConversation {
  readonly messages: readonly ChatMessage[];
  readonly redactions: readonly RedactionKind[];
}

/**
 * Sanea una conversación completa. Se sanea **todo** el historial, no solo el último mensaje: el
 * proveedor recibe la conversación entera en cada petición, así que un dato del primer turno
 * volvería a salir en el quinto.
 */
export function sanitizeConversation(messages: readonly ChatMessage[]): SanitizedConversation {
  const redactions = new Set<RedactionKind>();
  const sanitized = messages.map((message) => {
    const result = sanitizePii(message.text);
    for (const kind of result.redactions) redactions.add(kind);
    return { role: message.role, text: result.text };
  });

  return { messages: sanitized, redactions: [...redactions] };
}
