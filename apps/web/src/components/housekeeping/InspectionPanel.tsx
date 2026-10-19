"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { InspectionDto } from "@/lib/housekeeping-suite/types";
import type { RoomStateBoardEntry } from "@hotel/shared/domain";
import { EvidenceMissingNotice } from "@/components/maintenance/EvidenceMissingNotice";
import { InspectionRejectForm } from "./InspectionRejectForm";
import { SignatureGate } from "@/components/maintenance/SignatureGate";
import { SignaturePreviewModal } from "@/components/maintenance/SignaturePreviewModal";
import { useMaintenanceSignature } from "@/components/maintenance/useMaintenanceSignature";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const SECONDARY =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Panel de **inspección** del ama de llaves (F6 · T6.4/T6.6, CU-V-21/22).
 *
 * Con `INSPECTION_REQUIRES_SIGNATURE=false` (por defecto, D-C23) la certificación se registra sin
 * firma; con el flag activo exige firma EIP-712 (`INSPECTION`, rol `HEAD_KEEPER`) y previsualización.
 * Aprobar deja la habitación `CLEAN` y **no** toca `publication_status` (D-C9): la venta no se libera.
 * Rechazar la devuelve a `DIRTY` y la asignación vuelve a `PENDING` (retrabajo, CU-V-22).
 */
export function InspectionPanel({
  rooms,
  inspections,
  signatureRequired,
  canInspect,
}: {
  readonly rooms: readonly RoomStateBoardEntry[];
  readonly inspections: readonly InspectionDto[];
  readonly signatureRequired: boolean;
  readonly canInspect: boolean;
}) {
  const t = useTranslations("amaDeLlaves");
  const router = useRouter();
  const signature = useMaintenanceSignature();
  const inspectable = rooms.filter((room) => room.state !== "MAINTENANCE");
  const [roomId, setRoomId] = useState(inspectable[0]?.roomId ?? "");
  const [inspectionType, setInspectionType] = useState("CHECKOUT");
  const [observations, setObservations] = useState("");
  const [preview, setPreview] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(
    result: "APPROVED" | "REJECTED",
    signatureId?: string,
    rejectObservations?: string,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    const effectiveObservations = rejectObservations ?? observations;
    try {
      const response = await fetch("/api/housekeeping/inspections", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          inspectionType,
          result,
          observations: effectiveObservations.trim() || null,
          signatureId: signatureId ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setPreview(null);
      setObservations("");
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSigned(): Promise<void> {
    if (preview === null) return;
    try {
      await signature.signAndApply({
        action: "INSPECTION",
        roomId,
        inspectionType,
        result: preview,
        observations: observations.trim() || null,
        apply: (signatureId) => submit(preview, signatureId),
      });
    } catch {
      /* error mostrado por el hook */
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="inspection-panel">
      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("inspections.newTitle")}</h2>
        <p className="text-small text-ink-soft">
          {signatureRequired ? t("inspections.signatureOn") : t("inspections.signatureOff")}
        </p>
        <p className="text-micro text-ink-soft">{t("inspections.noSaleNote")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("inspections.room")}
            <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {inspectable.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.roomNumber} · {room.roomType}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("inspections.type")}
            <select className={FIELD} value={inspectionType} onChange={(event) => setInspectionType(event.target.value)}>
              {["CHECKOUT", "DAILY_SERVICE"].map((value) => (
                <option key={value} value={value}>
                  {t(`inspectionType.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-small text-ink">
            {t("inspections.observations")}
            <input className={FIELD} maxLength={500} value={observations} onChange={(event) => setObservations(event.target.value)} />
          </label>
        </div>
        {observations.trim() === "" && <EvidenceMissingNotice />}
        {canInspect ? (
          <SignatureGate requiresSignature={signatureRequired} enabled={signature.canSign} testId="inspection-actions">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BUTTON} disabled={busy || !roomId} onClick={() => setPreview("APPROVED")}>
                {t("inspections.approve")}
              </button>
              <button
                type="button"
                className={SECONDARY}
                disabled={busy || !roomId}
                onClick={() => (signatureRequired ? setPreview("REJECTED") : setShowRejectForm(true))}
              >
                {t("inspections.reject")}
              </button>
            </div>
          </SignatureGate>
        ) : (
          <p className="text-small text-ink-soft">{t("inspections.readOnly")}</p>
        )}
        {showRejectForm && !signatureRequired && (
          <InspectionRejectForm
            busy={busy}
            onReject={async (reason) => {
              setShowRejectForm(false);
              await submit("REJECTED", undefined, reason);
            }}
          />
        )}
        {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      </section>

      <section className="rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("inspections.listTitle")}</h2>
        {inspections.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("inspections.empty")}</p>
        ) : (
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {inspections.map((inspection) => (
              <li key={inspection.id} className="flex flex-wrap items-center gap-2 py-2 text-small text-ink">
                <span className="min-w-0 flex-1">
                  {new Date(inspection.createdAt).toLocaleString()} · {inspection.inspectedBy} ·{" "}
                  {t(`inspectionType.${inspection.inspectionType}`)}
                  {inspection.observations ? ` — ${inspection.observations}` : ""}
                </span>
                <span
                  data-testid="inspection-result"
                  className={`rounded-pill px-2 py-0.5 text-micro font-semibold ${
                    inspection.result === "APPROVED" ? "bg-success-bg text-success" : "bg-warning-bg text-warning"
                  }`}
                >
                  {t(`inspectionResult.${inspection.result}`)}
                </span>
                {inspection.signatureId && (
                  <span className="text-micro text-ink-soft" data-testid="inspection-signed">⛓ {t("inspections.signed")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview !== null && (
        <SignaturePreviewModal
          title={preview === "APPROVED" ? t("inspections.approve") : t("inspections.reject")}
          action="INSPECTION"
          entity={`${t("inspections.room")} ${inspectable.find((room) => room.roomId === roomId)?.roomNumber ?? roomId}`}
          fields={[
            { label: t("inspections.type"), value: t(`inspectionType.${inspectionType}`) },
            { label: t("inspections.observations"), value: observations.trim() || "—" },
          ]}
          busy={signature.busy}
          error={signature.error}
          onClose={() => setPreview(null)}
          onConfirm={() => void confirmSigned()}
        />
      )}
    </div>
  );
}
