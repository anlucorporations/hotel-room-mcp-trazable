"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

const KINDS = ["ELECTRICIDAD", "FONTANERIA", "CLIMATIZACION", "MOBILIARIO", "ELECTRODOMESTICO", "CERRADURA", "OTROS"] as const;

/**
 * Recepción reporta una incidencia (F10 · T10.1, CU-V-31): ticket a Mantenimiento **sin firma
 * on-chain** (D-C37); el rol de quien reporta queda en `reported_by_role`.
 */
export function ReceptionIncidentPanel() {
  const t = useTranslations("reception");
  const [rooms, setRooms] = useState<readonly { id: string; roomNumber: number }[]>([]);
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<string>("FONTANERIA");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/mantenimiento/rooms", { credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      const list = (data?.rooms ?? []) as { id: string; roomNumber: number }[];
      setRooms(list);
      if (list[0]) setRoomId(list[0].id);
    } catch {
      /* el listado es accesorio: el formulario sigue */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setTicket(null);
    try {
      const response = await fetch("/api/mantenimiento/incidents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, kind, description: description.trim() || null, blocksSale: true }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setTicket(data?.incident?.id ?? "OPEN");
      setDescription("");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="reception-incident-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("incidents.title")}</h2>
      <p className="text-small text-ink-soft">{t("incidents.hint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("incidents.room")}
          <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>{room.roomNumber}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("incidents.kind")}
          <select className={FIELD} value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>{t(`maintenanceKind.${value}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-small text-ink">
          {t("incidents.description")}
          <input className={FIELD} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="button" className={BUTTON} disabled={busy || !roomId} onClick={() => void submit()}>
          {t("incidents.submit")}
        </button>
      </div>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {ticket !== null && <p role="status" className="text-small text-success">{t("incidents.done")}</p>}
    </section>
  );
}
