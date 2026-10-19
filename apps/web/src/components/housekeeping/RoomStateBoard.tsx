"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { RoomStateBoardEntry } from "@hotel/shared/domain";

/** Orden de presentación de los estados del tablero (5 canónicos + mantenimiento). */
const STATE_ORDER = ["CLEAN", "DIRTY", "OCCUPIED", "PENDING_CLEANING", "IN_INSPECTION", "MAINTENANCE"] as const;

const STATE_STYLE: Record<string, string> = {
  CLEAN: "border-success/40 bg-success-bg text-success",
  DIRTY: "border-warning/40 bg-warning-bg text-warning",
  OCCUPIED: "border-azure/40 bg-info-bg text-info",
  PENDING_CLEANING: "border-line bg-mist text-ink",
  IN_INSPECTION: "border-coral-text/40 bg-mist-2 text-coral-text",
  MAINTENANCE: "border-error/40 bg-error-bg text-error",
};

export interface RoomStateBoardData {
  readonly date: string;
  readonly rooms: readonly RoomStateBoardEntry[];
  readonly summary: Record<string, number>;
  readonly generatedAt?: string;
}

/**
 * Tablero de **estado operativo** en tiempo real (F6 · T6.2/T6.5).
 *
 * `data-testid="room-state-board"`: pinta los cinco estados canónicos y la marca de mantenimiento.
 * Se actualiza por SSE (`event: rooms`) y cae a sondeo si el navegador no soporta `EventSource`; el
 * servidor emite solo cuando la firma del tablero cambia (≤2 s, D-30).
 */
export function RoomStateBoard({ initial }: { readonly initial: RoomStateBoardData }) {
  const t = useTranslations("amaDeLlaves");
  const [data, setData] = useState<RoomStateBoardData>(initial);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setLive(false);
      return;
    }
    const source = new EventSource(`/api/housekeeping/stream?view=rooms&date=${encodeURIComponent(initial.date)}`);
    source.addEventListener("rooms", (event) => {
      try {
        setData(JSON.parse((event as MessageEvent).data) as RoomStateBoardData);
        setLive(true);
      } catch {
        /* evento malformado: se conserva la última instantánea */
      }
    });
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [initial.date]);

  return (
    <section className="flex flex-col gap-4" data-testid="room-state-board">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-small text-ink-soft">{t("board.date", { date: data.date })}</p>
        <p
          className={`rounded-pill px-2 py-0.5 text-micro font-semibold ${live ? "bg-success-bg text-success" : "bg-mist-2 text-ink-soft"}`}
        >
          {live ? t("board.live") : t("board.polling")}
        </p>
      </div>

      <ul className="grid gap-2 tablet:grid-cols-3 desktop:grid-cols-6">
        {STATE_ORDER.map((state) => (
          <li key={state} className={`rounded-brand border px-3 py-2 ${STATE_STYLE[state] ?? ""}`}>
            <p className="text-micro font-semibold uppercase tracking-wider">{t(`state.${state}`)}</p>
            <p className="text-h3 font-semibold" data-testid={`room-state-${state}`}>
              {data.summary[state] ?? 0}
            </p>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-brand border border-line">
        <table className="w-full text-small">
          <caption className="sr-only">{t("board.caption")}</caption>
          <thead className="bg-mist text-left text-micro uppercase tracking-wider text-ink-soft">
            <tr>
              <th scope="col" className="px-3 py-2">{t("board.room")}</th>
              <th scope="col" className="px-3 py-2">{t("board.type")}</th>
              <th scope="col" className="px-3 py-2">{t("board.state")}</th>
              <th scope="col" className="px-3 py-2">{t("board.publication")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rooms.map((room) => (
              <tr key={room.roomId} data-testid="room-state-row">
                <td className="px-3 py-2 font-semibold text-ink">{room.roomNumber}</td>
                <td className="px-3 py-2 text-ink-soft">{room.roomType}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-pill border px-2 py-0.5 text-micro font-semibold ${STATE_STYLE[room.state] ?? ""}`}>
                    {t(`state.${room.state}`)}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-soft">{room.publicationStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rooms.length === 0 && (
        <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
          {t("board.empty")}
        </p>
      )}
    </section>
  );
}
