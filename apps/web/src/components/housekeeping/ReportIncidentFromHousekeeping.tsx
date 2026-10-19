"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RoomStateBoardEntry } from "@hotel/shared/domain";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

const KINDS = [
  "ELECTRICIDAD",
  "FONTANERIA",
  "CLIMATIZACION",
  "MOBILIARIO",
  "ELECTRODOMESTICO",
  "CERRADURA",
  "OTROS",
] as const;

/**
 * Reporte de avería desde la suite de limpieza (F6 · T6.7, CU-V-23).
 *
 * El ticket nace `OPEN` en la Suite de Mantenimiento (F4) con `reported_by_role` = rol de la sesión
 * (`HEAD_KEEPER`/`HOUSEKEEPER`), de modo que el jefe sabe de dónde viene antes de clasificarlo.
 */
export function ReportIncidentFromHousekeeping({
  rooms,
  canReport,
}: {
  readonly rooms: readonly RoomStateBoardEntry[];
  readonly canReport: boolean;
}) {
  const t = useTranslations("amaDeLlaves");
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.roomId ?? "");
  const [kind, setKind] = useState<string>("FONTANERIA");
  const [description, setDescription] = useState("");
  const [blocksSale, setBlocksSale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  if (!canReport) return null;

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setTicket(null);
    try {
      const response = await fetch("/api/mantenimiento/incidents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, kind, description: description.trim() || null, blocksSale }),
      });
      const data = (await response.json().catch(() => null)) as
        | { incident?: { id?: string }; message?: string }
        | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setTicket(data?.incident?.id ?? "OPEN");
      setDescription("");
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="report-incident-housekeeping">
      <h2 className="text-h4 font-semibold text-ink">{t("report.title")}</h2>
      <p className="text-small text-ink-soft">{t("report.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("report.room")}
          <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.roomId} value={room.roomId}>
                {room.roomNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("report.kind")}
          <select className={FIELD} value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`report.kindLabel.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-small text-ink">
          {t("report.description")}
          <input className={FIELD} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-small text-ink">
          <input type="checkbox" checked={blocksSale} onChange={(event) => setBlocksSale(event.target.checked)} />
          {t("report.blocksSale")}
        </label>
        <button type="button" className={BUTTON} disabled={busy || !roomId} onClick={() => void submit()}>
          {t("report.submit")}
        </button>
      </div>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {ticket !== null && <p role="status" className="text-small text-success">{t("report.done")}</p>}
    </section>
  );
}
