"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MAINTENANCE_KINDS, MAINTENANCE_PRIORITIES } from "@hotel/shared/domain";

interface RoomOption {
  id: string;
  roomNumber: number;
  roomType: string;
}

/**
 * Formulario para **reportar una avería** (F4 · D-52).
 *
 * Lo usan recepción y limpieza: eligen habitación, tipo y prioridad, y dejan una descripción. La
 * incidencia nace `OPEN` y, salvo que se desmarque, **retira la habitación de la venta** hasta que el
 * técnico la resuelva (D-53). El propio formulario carga las habitaciones reportables; es reutilizable
 * desde cualquier pantalla que reciba un `apiFetch` de sesión.
 */
export function ReportIncidentPanel({
  apiFetch,
}: {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const t = useTranslations("maintenance");
  const [rooms, setRooms] = useState<readonly RoomOption[]>([]);
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<string>(MAINTENANCE_KINDS[0]);
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch("/api/mantenimiento/rooms")
      .then((res) => res.json().catch(() => ({})))
      .then((data: { rooms?: RoomOption[] }) => {
        if (!active) return;
        const list = data.rooms ?? [];
        setRooms(list);
        if (list.length > 0) setRoomId((current) => current || list[0]!.id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!roomId) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await apiFetch("/api/mantenimiento/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, kind, priority, description: description.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("reportError"));
      setDescription("");
      setDone(t("reportDone", { room: rooms.find((room) => room.id === roomId)?.roomNumber ?? "" }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("reportError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="report-incident-title" className="rounded-brand-lg border border-line bg-shell p-4">
      <h2 id="report-incident-title" className="font-display text-h3 font-semibold text-ink">
        {t("reportTitle")}
      </h2>
      <p className="mt-1 text-small text-ink-soft">{t("reportHint")}</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small">
          <span className="font-medium text-ink">{t("reportRoom")}</span>
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            data-testid="report-room"
            className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.roomNumber} · {room.roomType}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small">
          <span className="font-medium text-ink">{t("reportKind")}</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            data-testid="report-kind"
            className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
          >
            {MAINTENANCE_KINDS.map((option) => (
              <option key={option} value={option}>
                {t(`kind.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-small">
          <span className="font-medium text-ink">{t("reportPriority")}</span>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
          >
            {MAINTENANCE_PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {t(`priority.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-small">
          <span className="font-medium text-ink">{t("reportDescription")}</span>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-touch rounded-brand-sm border border-line-strong bg-mist px-3"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !roomId}
          className="min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell disabled:opacity-50"
        >
          {t("reportSubmit")}
        </button>
      </form>
      {done && (
        <p role="status" className="mt-2 text-small text-success">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-coral-text">
          {error}
        </p>
      )}
    </section>
  );
}
