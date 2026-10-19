"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { IncidentDto, IncidentEventDto } from "@/lib/mantenimiento/types";
import { EvidenceMissingNotice } from "./EvidenceMissingNotice";
import { SignatureGate } from "./SignatureGate";
import { SignaturePendingBanner } from "./SignaturePendingBanner";
import { SignaturePreviewModal } from "./SignaturePreviewModal";
import { useMaintenanceSignature } from "./useMaintenanceSignature";

const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const SECONDARY =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Ficha de incidencia con bloqueo/desbloqueo **firmado** (F4 · T4.2/T4.3).
 *
 * El bloqueo exige una firma EIP-712 `ROOM_BLOCK` (⛓ + previsualización) y deja la habitación en
 * `MAINTENANCE`, fuera del catálogo. El desbloqueo también se firma y restaura el estado previo.
 */
export function IncidentDetail({
  incident,
  events,
  publicationStatus,
  canManage,
}: {
  readonly incident: IncidentDto;
  readonly events: readonly IncidentEventDto[];
  readonly publicationStatus: string | null;
  readonly canManage: boolean;
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const signature = useMaintenanceSignature();
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [preview, setPreview] = useState<"ROOM_BLOCK" | "ROOM_UNBLOCK" | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = publicationStatus === "MAINTENANCE";
  const open = incident.status === "OPEN" || incident.status === "IN_PROGRESS";

  async function applySignature(signatureId: string, action: "ROOM_BLOCK" | "ROOM_UNBLOCK"): Promise<void> {
    const response = await fetch(`/api/mantenimiento/rooms/${incident.roomId}/${action === "ROOM_BLOCK" ? "block" : "unblock"}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureId, incidentId: incident.id, reason: reason.trim() || null, until: until || null }),
    });
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
    setPendingAnchor(true);
    setPreview(null);
    router.refresh();
  }

  async function confirmPreview(): Promise<void> {
    if (preview === null) return;
    setError(null);
    try {
      await signature.signAndApply({
        action: preview,
        roomId: incident.roomId,
        incidentId: incident.id,
        reason: reason.trim() || null,
        until: until || null,
        apply: (signatureId) => applySignature(signatureId, preview),
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="incident-detail">
      <div className="rounded-brand border border-line px-4 py-4">
        <p className="text-h4 font-semibold text-ink">
          {t("room")} {incident.roomNumber ?? "—"} · {t(`kind.${incident.kind}`)}
        </p>
        <p className="mt-1 text-small text-ink-soft">
          {t(`status.${incident.status}`)} · {t(`priority.${incident.priority}`)} ·{" "}
          {t("reportedBy", { name: incident.reportedBy })}
          {incident.assignedTo ? ` · ${t("assignedTo", { name: incident.assignedTo })}` : ""}
        </p>
        {incident.description !== null && <p className="mt-2 text-small text-ink">{incident.description}</p>}
        {pendingAnchor && (
          <div className="mt-3">
            <SignaturePendingBanner />
          </div>
        )}
      </div>

      {canManage && open && (
        <section className="flex flex-col gap-3 rounded-brand border border-line px-4 py-4">
          <h2 className="text-h4 font-semibold text-ink">{blocked ? t("unblockTitle") : t("blockTitle")}</h2>
          <p className="text-small text-ink-soft">{t("blockHint")}</p>
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("blockReason")}
            <input className={FIELD} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
          </label>
          {!blocked && (
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("blockUntil")}
              <input type="date" className={FIELD} value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>
          )}
          {error !== null && (
            <p role="alert" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
              {error}
            </p>
          )}
          <SignatureGate requiresSignature enabled={signature.canSign} testId="incident-block-action">
            <button
              type="button"
              className={BUTTON}
              disabled={signature.busy}
              onClick={() => setPreview(blocked ? "ROOM_UNBLOCK" : "ROOM_BLOCK")}
            >
              {blocked ? t("unblockButton") : t("blockButton")}
            </button>
          </SignatureGate>
        </section>
      )}

      <section className="rounded-brand border border-line px-4 py-4">
        <h2 className="text-h4 font-semibold text-ink">{t("historyTitle")}</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-small text-ink-soft">{t("historyEmpty")}</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1 text-small text-ink-soft">
            {events.map((event) => (
              <li key={event.id}>
                {new Date(event.createdAt).toLocaleString()} · {event.eventType} · {event.actor}
                {event.notes ? ` — ${event.notes}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>

      {preview !== null && (
        <SignaturePreviewModal
          title={preview === "ROOM_BLOCK" ? t("blockTitle") : t("unblockTitle")}
          action={preview}
          entity={`${t("room")} ${incident.roomNumber ?? incident.roomId}`}
          fields={[
            { label: t("blockReason"), value: reason.trim() || "—" },
            ...(preview === "ROOM_BLOCK" ? [{ label: t("blockUntil"), value: until || "—" }] : []),
          ]}
          busy={signature.busy}
          error={signature.error}
          onClose={() => setPreview(null)}
          onConfirm={() => void confirmPreview()}
        />
      )}

      {(incident.description === null || incident.description.trim() === "") && <EvidenceMissingNotice />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={SECONDARY} onClick={() => router.push("/mantenimiento/incidencias")}>
          {t("backToList")}
        </button>
      </div>
    </div>
  );
}
