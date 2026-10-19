"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const SECONDARY =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Formulario de **rechazo de limpieza** (F6 · T6.6, CU-V-22).
 *
 * Rechazar devuelve la asignación a `PENDING` y la habitación a `DIRTY` para retrabajo; las
 * observaciones son la instrucción que recibe la camarera. Se usa desde `InspectionPanel` y en la
 * ficha de la habitación del tablero.
 */
export function InspectionRejectForm({
  onReject,
  busy,
}: {
  readonly onReject: (observations: string) => void | Promise<void>;
  readonly busy: boolean;
}) {
  const t = useTranslations("amaDeLlaves");
  const [observations, setObservations] = useState("");

  return (
    <form
      className="flex flex-col gap-2"
      data-testid="inspection-reject-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onReject(observations.trim());
      }}
    >
      <label className="flex flex-col gap-1 text-small text-ink">
        {t("inspections.rejectReason")}
        <input
          className={FIELD}
          maxLength={500}
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
        />
      </label>
      <p className="text-micro text-ink-soft">{t("inspections.rejectHint")}</p>
      <button type="submit" className={SECONDARY} disabled={busy}>
        {t("inspections.rejectConfirm")}
      </button>
    </form>
  );
}
