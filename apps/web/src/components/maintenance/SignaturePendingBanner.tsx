"use client";

import { useTranslations } from "next-intl";

/**
 * Aviso de **firma en cola de anclaje** (`PENDING_ANCHOR`, F4 · T4.3, CU-V-03/05/07/43).
 *
 * La verdad operativa ya cambió en PostgreSQL y no se revierte (RNF-M-14); el worker anclará la
 * operación en la cadena en cuanto pueda. `data-testid="signature-pending-anchor"` es el oráculo.
 */
export function SignaturePendingBanner({ signatureId }: { readonly signatureId?: string | null }) {
  const t = useTranslations("maintenance");
  return (
    <p
      data-testid="signature-pending-anchor"
      role="status"
      className="rounded-brand-lg border border-info/40 bg-info-bg px-4 py-3 text-small text-info"
    >
      {t("signature.pendingAnchor")}
      {signatureId ? ` (${signatureId.slice(0, 8)}…)` : ""}
    </p>
  );
}
