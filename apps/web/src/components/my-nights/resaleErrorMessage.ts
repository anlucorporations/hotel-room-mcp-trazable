import { classifyTxError } from "@/components/tx/txError";

/**
 * Errores REVERT del contrato relevantes para la reventa (CU-06, DISEÑO-UX §4.3).
 * Cada uno mapea a una clave de i18n bajo `myNights.resaleError.*`.
 */
const RESALE_ERRORS = ["NotOwner", "InvalidPrice", "NightExpired", "NotListed"] as const;

export type ResaleErrorName = (typeof RESALE_ERRORS)[number];

/** Clave de i18n del mensaje a mostrar al fallar `list`/`unlist`. */
export type ResaleErrorKey = `resaleError.${ResaleErrorName}` | `txError.rejected` | `txError.failed`;

interface ErrorLike {
  readonly name?: string;
  readonly message?: string;
  readonly shortMessage?: string;
  readonly details?: string;
  readonly cause?: ErrorLike;
}

/**
 * Concatena los textos de un error de viem/wagmi en toda la cadena de `cause`, donde el
 * nombre del error REVERT del contrato (p. ej. `NightExpired()`) suele aparecer en
 * `shortMessage`/`message`/`details` de algún nivel.
 */
function collectErrorText(error: ErrorLike | undefined): string {
  const parts: string[] = [];
  for (let e = error; e; e = e.cause) {
    if (e.shortMessage) parts.push(e.shortMessage);
    if (e.message) parts.push(e.message);
    if (e.details) parts.push(e.details);
    if (e.name) parts.push(e.name);
  }
  return parts.join(" ");
}

/** Detecta el nombre del error REVERT de reventa dentro del texto del error de viem. */
function detectResaleError(error: ErrorLike | undefined): ResaleErrorName | null {
  const text = collectErrorText(error);
  return RESALE_ERRORS.find((name) => text.includes(name)) ?? null;
}

/**
 * Traduce un fallo de `list`/`unlist` a una clave de i18n (sin texto literal → testeable):
 * - errores REVERT del contrato → mensaje específico (`resaleError.*`);
 * - en su defecto, cae al feedback genérico de `classifyTxError` (rechazo de firma o fallo).
 * Función pura: el componente resuelve la traducción.
 */
export function resaleErrorMessage(error: unknown): ResaleErrorKey {
  const resaleError = detectResaleError(error as ErrorLike);
  if (resaleError) return `resaleError.${resaleError}`;
  return `txError.${classifyTxError(error)}`;
}
