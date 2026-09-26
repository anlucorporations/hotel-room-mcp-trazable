"use client";

import { useTranslations } from "next-intl";
import type { RoomBoardStatus } from "@hotel/shared/domain";
import type { DayStats, Reservation, RoomCell } from "./types";

/** Clase de color de cada estado de habitación (paleta del proyecto, contraste AA). */
const ROOM_STATUS_CLASS: Readonly<Record<RoomBoardStatus, string>> = {
  LIBRE: "border-olive/40 bg-olive/10 text-olive",
  PENDIENTE: "border-gold/50 bg-gold/10 text-ink",
  RESERVADA: "border-sea/40 bg-sea/10 text-sea-deep",
  OCUPADA: "border-terracotta/50 bg-terracotta/10 text-terracotta-text",
  SALIDA: "border-line bg-sand-2 text-ink-soft",
  BLOQUEADA: "border-ink-soft/40 bg-ink-soft/10 text-ink-soft",
};

function statusKey(status: RoomBoardStatus): string {
  return `room${status.charAt(0)}${status.slice(1).toLowerCase()}`;
}

export function DayBoard({
  date,
  onDateChange,
  onRefresh,
  loading,
  error,
  reservations,
  rooms,
  stats,
}: {
  date: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  reservations: readonly Reservation[];
  rooms: readonly RoomCell[];
  stats: DayStats | null;
}) {
  const t = useTranslations("reception");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("dateLabel")}
          <input
            type="date"
            data-testid="reception-date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="min-h-touch rounded-brand border border-line bg-shell px-3 text-ink outline-none focus:border-sea"
          />
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-touch rounded-pill border border-line px-5 font-semibold text-ink transition-colors hover:border-sea hover:text-sea disabled:opacity-60"
        >
          {loading ? t("loading") : t("refresh")}
        </button>
      </div>

      {error && (
        <p role="alert" data-testid="reception-error" className="rounded-brand border border-terracotta-text/40 bg-sand-2 px-4 py-3 text-terracotta-text">
          {error}
        </p>
      )}

      {stats && (
        <dl className="grid grid-cols-2 gap-3 tablet:grid-cols-5" data-testid="reception-stats">
          <Stat label={t("statsTotal")} value={stats.totalRooms} />
          <Stat label={t("statsReserved")} value={stats.reserved} />
          <Stat label={t("statsOccupied")} value={stats.occupied} />
          <Stat label={t("statsDepartures")} value={stats.departures} />
          <Stat label={t("statsFree")} value={stats.free} />
        </dl>
      )}

      <section aria-labelledby="reservations-title">
        <h2 id="reservations-title" className="font-display text-h3 font-semibold">
          {t("reservationsTitle")}
        </h2>
        {reservations.length === 0 ? (
          <p data-testid="reservations-empty" className="mt-2 text-ink-soft">
            {t("reservationsEmpty")}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table data-testid="reservations-table" className="w-full border-collapse text-small">
              <caption className="sr-only">{t("reservationsTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th scope="col" className="px-2 py-2">{t("colRoom")}</th>
                  <th scope="col" className="px-2 py-2">{t("colType")}</th>
                  <th scope="col" className="px-2 py-2">{t("colStatus")}</th>
                  <th scope="col" className="px-2 py-2">{t("colRecovery")}</th>
                  <th scope="col" className="px-2 py-2">{t("colOwner")}</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
                  <tr key={reservation.tokenId} className="border-b border-line/60">
                    <td className="px-2 py-2 font-semibold">{reservation.roomNumber}</td>
                    <td className="px-2 py-2">{reservation.roomType}</td>
                    <td className="px-2 py-2">{reservation.status}</td>
                    <td className="px-2 py-2 font-mono text-micro">{reservation.recoveryCode ?? "—"}</td>
                    <td className="px-2 py-2 font-mono text-micro">{`${reservation.currentOwner.slice(0, 8)}…`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="rooms-title">
        <h2 id="rooms-title" className="font-display text-h3 font-semibold">
          {t("roomsTitle")}
        </h2>
        <p className="mt-1 text-small text-ink-soft">{t("roomsHint")}</p>
        <ul data-testid="rooms-grid" className="mt-3 grid grid-cols-2 gap-2 tablet:grid-cols-5 desktop:grid-cols-8">
          {rooms.map((room) => (
            <li
              key={room.roomNumber}
              className={`rounded-brand border px-3 py-2 text-small ${ROOM_STATUS_CLASS[room.status]}`}
            >
              <span className="block font-semibold">{room.roomNumber}</span>
              <span className="block text-micro">{t(statusKey(room.status) as "roomLibre")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-brand border border-line bg-shell px-3 py-2">
      <dt className="text-micro uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="font-display text-h3 font-semibold text-ink">{value}</dd>
    </div>
  );
}
