"use client";

import { useTranslations } from "next-intl";
import { ModalShell, MODAL_PRIMARY, MODAL_SECONDARY } from "@/components/ui/ModalShell";

/** Campo de la previsualización: etiqueta legible + valor (ya formateado por el llamante). */
export interface SignaturePreviewField {
  readonly label: string;
  readonly value: string;
}

/**
 * **Modal de previsualización** previo a firmar una operación (F4 · T4.3, CU-V-03/05/07/38).
 *
 * Muestra exactamente lo que se va a firmar (acción, entidad y datos) y no permite confirmar sin
 * revisarlo. `data-testid="signature-preview"` es el oráculo de los E2E.
 */
export function SignaturePreviewModal({
  title,
  action,
  entity,
  fields,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  readonly title: string;
  readonly action: string;
  readonly entity: string;
  readonly fields: readonly SignaturePreviewField[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations("maintenance");

  return (
    <ModalShell
      title={title}
      subtitle={t("signature.previewHint")}
      closeLabel={t("signature.cancel")}
      onClose={onClose}
      testId="signature-preview"
      footerTestId="signature-preview-footer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={MODAL_SECONDARY} onClick={onClose} disabled={busy}>
            {t("signature.cancel")}
          </button>
          <button
            type="button"
            className={MODAL_PRIMARY}
            onClick={onConfirm}
            disabled={busy}
            data-testid="signature-confirm"
          >
            {busy ? t("signature.signing") : t("signature.confirm")}
          </button>
        </div>
      }
    >
      <dl className="flex flex-col gap-2 text-small">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-ink">{t("signature.actionLabel")}:</dt>
          <dd className="text-ink-soft">{action}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-ink">{t("signature.entityLabel")}:</dt>
          <dd className="text-ink-soft">{entity}</dd>
        </div>
        {fields.map((field) => (
          <div key={field.label} className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-ink">{field.label}:</dt>
            <dd className="text-ink-soft">{field.value}</dd>
          </div>
        ))}
      </dl>
      {error !== null && (
        <p role="alert" className="mt-3 rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
          {error}
        </p>
      )}
      <p className="mt-3 text-micro text-ink-soft">{t("signature.note")}</p>
    </ModalShell>
  );
}
