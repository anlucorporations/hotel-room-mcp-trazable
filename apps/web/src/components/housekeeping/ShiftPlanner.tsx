"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ShiftDto } from "@/lib/housekeeping-suite/types";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/**
 * Planificador de **turnos** y reparto automático (F6 · T6.2, CU-V-17).
 *
 * Crea los turnos del día (MANANA/TARDE/NOCHE) y lanza el reparto rotatorio entre las camareras.
 */
export function ShiftPlanner({
  date,
  shifts,
  assignees,
}: {
  readonly date: string;
  readonly shifts: readonly ShiftDto[];
  readonly assignees: readonly string[];
}) {
  const t = useTranslations("amaDeLlaves");
  const router = useRouter();
  const [label, setLabel] = useState("MANANA");
  const [people, setPeople] = useState(assignees.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(path: string, body: unknown, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setNotice(success);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  const peopleList = people
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  return (
    <div className="flex flex-col gap-4" data-testid="shift-planner">
      <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("shifts.createTitle")}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-small text-ink">
            {t("shifts.label")}
            <select className={FIELD} value={label} onChange={(event) => setLabel(event.target.value)}>
              {["MANANA", "TARDE", "NOCHE"].map((value) => (
                <option key={value} value={value}>
                  {t(`shiftLabel.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void call("/api/housekeeping/shifts", { date, label }, t("shifts.created"))}
          >
            {t("shifts.create")}
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-col gap-1 text-small text-ink">
            {t("shifts.assignees")}
            <input className={FIELD} value={people} onChange={(event) => setPeople(event.target.value)} />
          </label>
          <button
            type="button"
            className={BUTTON}
            disabled={busy || shifts.length === 0 || peopleList.length === 0}
            onClick={() =>
              void call(
                "/api/housekeeping/assignments",
                { shiftId: shifts[0]?.id, assignees: peopleList },
                t("shifts.assigned"),
              )
            }
          >
            {t("shifts.autoAssign")}
          </button>
        </div>
        {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
        {notice !== null && <p role="status" className="text-small text-success">{notice}</p>}
      </section>

      <section className="rounded-brand border border-line px-4 py-3">
        <h2 className="text-h4 font-semibold text-ink">{t("shifts.listTitle")}</h2>
        {shifts.length === 0 ? (
          <p data-testid="empty-state" className="mt-1 text-small text-ink-soft">{t("shifts.empty")}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-small text-ink">
            {shifts.map((shift) => (
              <li key={shift.id}>
                {t(`shiftLabel.${shift.label}`)} · {shift.supervisor}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
