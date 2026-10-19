"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink";
const KINDS = ["ELECTRICIDAD", "FONTANERIA", "CLIMATIZACION", "MOBILIARIO", "ELECTRODOMESTICO", "CERRADURA", "OTROS"] as const;

/** Reporte de avería desde el terminal (F5 · T5.2, D-C36): nace OPEN para el jefe. */
export function TerminalReportForm() {
  const t = useTranslations("terminal");
  const router = useRouter();
  const [rooms, setRooms] = useState<readonly { id: string; roomNumber: number }[]>([]);
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<string>("FONTANERIA");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetch("/api/terminal/tasks", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data: { rooms?: { id: string; roomNumber: number }[] }) => {
        setRooms(data.rooms ?? []);
        if (data.rooms?.[0]) setRoomId(data.rooms[0].id);
      })
      .catch(() => undefined);
  }, []);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/incidents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, kind, description: description.trim() || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setDone(true);
      setDescription("");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("reportError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3" data-testid="terminal-report">
      <h1 className="font-display text-h3 font-semibold text-ink">{t("reportTitle")}</h1>
      <p className="text-small text-ink-soft">{t("reportHint")}</p>
      <label className="flex flex-col gap-1 text-small text-ink">
        {t("reportRoom")}
        <select className={FIELD} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>{room.roomNumber}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-small text-ink">
        {t("reportKind")}
        <select className={FIELD} value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((value) => (
            <option key={value} value={value}>{t(`kind.${value}`)}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-small text-ink">
        {t("reportDescription")}
        <input className={FIELD} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      {done && <p role="status" className="text-small text-success" data-testid="terminal-report-done">{t("reportDone")}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || roomId.length === 0} onClick={() => void submit()} className="min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell disabled:opacity-60">
          {t("reportSubmit")}
        </button>
        <button type="button" onClick={() => router.push("/terminal")} className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink">
          {t("back")}
        </button>
      </div>
    </section>
  );
}
