"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PreventiveTaskDto } from "@/lib/mantenimiento/types";
import { EvidenceMissingNotice } from "./EvidenceMissingNotice";
import { SignatureGate } from "./SignatureGate";
import { SignaturePreviewModal } from "./SignaturePreviewModal";
import { useMaintenanceSignature } from "./useMaintenanceSignature";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";
const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";

/**
 * Tablero de **preventivo** (F4 · T4.2/T4.5).
 *
 * Las tareas de área crítica (`requiresSignature`) solo se cierran con firma EIP-712
 * `PREVENTIVE_TASK`; las no críticas se cierran sin firma. El cierre sin evidencia se permite con
 * aviso (`evidence-missing`, D-C12).
 */
export function PreventiveBoard({ tasks }: { readonly tasks: readonly PreventiveTaskDto[] }) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const signature = useMaintenanceSignature();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ task: PreventiveTaskDto; action: "complete" | "skip" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function closeTask(taskId: string, action: "complete" | "skip", signatureId?: string): Promise<void> {
    setBusyId(taskId);
    setError(null);
    try {
      const response = await fetch("/api/mantenimiento/preventivo", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          action,
          notes: notes[taskId]?.trim() || null,
          evidencePath: evidence[taskId]?.trim() || null,
          signatureId: signatureId ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setPending(null);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSigned(): Promise<void> {
    if (pending === null) return;
    try {
      await signature.signAndApply({
        action: "PREVENTIVE_TASK",
        taskId: pending.task.id,
        apply: (signatureId) => closeTask(pending.task.id, pending.action, signatureId),
      });
    } catch {
      /* El error se pinta desde el hook/estado local. */
    }
  }

  if (tasks.length === 0) {
    return (
      <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
        {t("noTasks")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="preventive-board">
      {error !== null && (
        <p role="alert" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-brand border border-line">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <p className="font-semibold text-ink">
                {task.planName ?? task.planCode ?? t("tasksTitle")}
                {task.areaName ? ` · ${task.areaName}` : ""}
              </p>
              <p className="text-micro text-ink-soft">
                {t("dueDate", { date: task.dueDate })}
                {task.overdue ? ` · ${t("overdue")}` : ""}
                {task.isCritical ? ` · ${t("criticalArea")}` : ""}
              </p>
            </div>
            <div className="grid gap-2 tablet:grid-cols-2">
              <input
                className={FIELD}
                placeholder={t("notesPlaceholder")}
                maxLength={200}
                value={notes[task.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
              />
              <input
                className={FIELD}
                placeholder={t("evidencePlaceholder")}
                maxLength={500}
                value={evidence[task.id] ?? ""}
                onChange={(event) => setEvidence((current) => ({ ...current, [task.id]: event.target.value }))}
              />
            </div>
            {(evidence[task.id] ?? "").trim() === "" && <EvidenceMissingNotice />}
            {task.requiresSignature ? (
              <SignatureGate requiresSignature enabled={signature.canSign} testId="preventive-signature-action">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={busyId === task.id || signature.busy}
                    onClick={() => setPending({ task, action: "complete" })}
                  >
                    {t("complete")}
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={busyId === task.id || signature.busy}
                    onClick={() => setPending({ task, action: "skip" })}
                  >
                    {t("skip")}
                  </button>
                </div>
              </SignatureGate>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BUTTON} disabled={busyId === task.id} onClick={() => void closeTask(task.id, "complete")}>
                  {t("complete")}
                </button>
                <button type="button" className={BUTTON} disabled={busyId === task.id} onClick={() => void closeTask(task.id, "skip")}>
                  {t("skip")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {pending !== null && (
        <SignaturePreviewModal
          title={pending.action === "complete" ? t("complete") : t("skip")}
          action="PREVENTIVE_TASK"
          entity={pending.task.planName ?? pending.task.planCode ?? pending.task.id}
          fields={[
            { label: t("dueDate", { date: pending.task.dueDate }), value: pending.task.areaName ?? "—" },
            { label: t("notesPlaceholder"), value: notes[pending.task.id]?.trim() || "—" },
          ]}
          busy={signature.busy}
          error={signature.error}
          onClose={() => setPending(null)}
          onConfirm={() => void confirmSigned()}
        />
      )}
    </div>
  );
}
