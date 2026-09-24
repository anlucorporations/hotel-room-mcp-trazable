"use client";

import { useTranslations } from "next-intl";

/**
 * Aviso del estado de pausa del contrato canónico (M7).
 *
 * Tres estados, tres verdades distintas (no se colapsan en una):
 *   - `true`  → el contrato está en pausa: las compras revertirían con `EnforcedPause`.
 *   - `false` → sin aviso.
 *   - `null`  → no se pudo comprobar: se dice, en lugar de prometer que las ventas están abiertas.
 */
export function ContractPausedBanner({ paused }: { readonly paused: boolean | null }) {
  const t = useTranslations("contractPaused");

  if (paused === false) return null;

  const isPaused = paused === true;
  return (
    <p
      data-testid={isPaused ? "contract-paused" : "contract-paused-unknown"}
      role="status"
      className="rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-small text-terracotta-text"
    >
      <strong className="font-semibold">{t(isPaused ? "title" : "unknownTitle")}. </strong>
      {t(isPaused ? "hint" : "unknownHint")}
    </p>
  );
}
