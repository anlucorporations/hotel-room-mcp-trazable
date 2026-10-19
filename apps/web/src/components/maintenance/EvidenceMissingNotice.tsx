"use client";

import { useTranslations } from "next-intl";

/**
 * Aviso **no bloqueante** de «evidencia no adjunta» (F4 · T4.3, D-C12).
 *
 * Cerrar una tarea o verificar una ejecución sin foto/nota está permitido: se avisa con
 * `data-testid="evidence-missing"` y la acción sigue su curso.
 */
export function EvidenceMissingNotice() {
  const t = useTranslations("maintenance");
  return (
    <p
      data-testid="evidence-missing"
      role="status"
      className="w-fit rounded-brand-sm border border-line bg-mist-2 px-3 py-1 text-micro text-ink-soft"
    >
      {t("evidence.missing")}
    </p>
  );
}
