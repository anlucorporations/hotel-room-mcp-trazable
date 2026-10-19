"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Publicar/despublicar la venta manualmente (F10 · T10.2, D-C9): tras una inspección o un
 * mantenimiento la venta no se libera sola; recepción lo decide **sin firma on-chain** (D-C37).
 */
export function RoomPublicationPanel({
  rooms,
}: {
  readonly rooms: readonly { id: string; roomNumber: number; roomType: string; publicationStatus: string }[];
}) {
  const t = useTranslations("reception");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState(rooms);

  async function toggle(id: string, roomNumber: number, action: "publish" | "unpublish"): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/reception/rooms/${roomNumber}/publication`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setRows((current) =>
        current.map((room) =>
          room.id === id ? { ...room, publicationStatus: action === "publish" ? "PUBLISHED" : "PAUSED" } : room,
        ),
      );
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-brand border border-line px-4 py-3" data-testid="room-publication-panel">
      <h2 className="text-h4 font-semibold text-ink">{t("publication.title")}</h2>
      <p className="text-small text-ink-soft">{t("publication.hint")}</p>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((room) => (
          <li key={room.id} className="flex flex-wrap items-center gap-2 py-2 text-small text-ink">
            <span className="min-w-0 flex-1">
              {room.roomNumber} · {room.roomType} · <strong>{room.publicationStatus}</strong>
            </span>
            {room.publicationStatus === "PUBLISHED" ? (
              <button type="button" className={BUTTON} disabled={busyId === room.id} onClick={() => void toggle(room.id, room.roomNumber, "unpublish")}>
                {t("publication.unpublish")}
              </button>
            ) : (
              <button type="button" className={BUTTON} disabled={busyId === room.id} onClick={() => void toggle(room.id, room.roomNumber, "publish")}>
                {t("publication.publish")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
