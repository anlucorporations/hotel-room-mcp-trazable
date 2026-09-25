import { classifyTxError } from "@/components/tx/txError";

/**
 * Errores REVERT del contrato específicos del back-office (MINOR#32/#33). Cada uno mapea a una
 * clave de i18n bajo `admin.txError.*`:
 *  - `NoFunds`: `withdraw()` sin saldo retirable, aunque el balance bruto mostrado sea > 0
 *    (el residual reservado de reventas no es retirable).
 *  - `EnforcedPause`: acción `whenNotPaused` con el sistema en pausa (`mint`, `buy`, `buyResale`,
 *    `markCheckedIn` y `burnExpired`). OJO: `withdraw` NO lleva `whenNotPaused` —se permite en
 *    pausa a propósito, como vía de remediación—, así que no se bloquea por pausa (M7 · H5).
 */
const ADMIN_ERRORS = ["NoFunds", "EnforcedPause"] as const;

type AdminErrorName = (typeof ADMIN_ERRORS)[number];

/** Clave de i18n del mensaje de error, reutilizando las claves genéricas de `admin.txError`. */
export type AdminTxErrorKey = "noFunds" | "paused" | "rejected" | "failed";

interface ErrorLike {
  readonly name?: string;
  readonly message?: string;
  readonly shortMessage?: string;
  readonly details?: string;
  readonly cause?: ErrorLike;
}

/** Concatena los textos del error de viem en toda la cadena de `cause` (igual que en reventa). */
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

function detectAdminError(error: ErrorLike | undefined): AdminErrorName | null {
  const text = collectErrorText(error);
  return ADMIN_ERRORS.find((name) => text.includes(name)) ?? null;
}

/**
 * Traduce un fallo de escritura del back-office a una clave de i18n (`admin.txError.*`):
 * errores REVERT específicos (`NoFunds`→`noFunds`, `EnforcedPause`→`paused`) y, en su defecto,
 * el feedback genérico de `classifyTxError` (`rejected`/`failed`). Función pura → testeable.
 */
export function classifyAdminTxError(error: unknown): AdminTxErrorKey {
  switch (detectAdminError(error as ErrorLike)) {
    case "NoFunds":
      return "noFunds";
    case "EnforcedPause":
      return "paused";
    default:
      return classifyTxError(error);
  }
}
