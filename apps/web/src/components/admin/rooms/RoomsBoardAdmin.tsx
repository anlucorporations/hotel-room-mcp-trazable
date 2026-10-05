"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminCard } from "@/components/admin/AdminPanel";
import { CalendarioHabitaciones } from "@/components/rooms/CalendarioHabitaciones";
import { MaintenanceIcon, OccupiedIcon, PublishedIcon, ReservedIcon } from "@/components/rooms/roomIcons";
import {
  addDays,
  enumerateDates,
  isDayRoomEligible,
  isoParts,
  rangeForView,
  type BoardDayAction,
  type BoardDayTotals,
  type BoardRange,
  type BoardView,
} from "@/lib/room-board-calendar";
import { BoardDayActions } from "./BoardDayActions";
import type { BoardNotice, DayDetail } from "./board-dto";

/**
 * **Tablero de disponibilidad** del back-office (2026-10-04, subsección «Publicar»).
 *
 * Es el contenedor: mantiene la vista (día/semana/mes/trimestre), el periodo y el día seleccionado,
 * pide los agregados a `GET /api/admin/rooms/calendar`, y compone:
 *   · `CalendarioHabitaciones` (mapa reutilizable, solo presentación);
 *   · la lista de habitaciones del día con su estado;
 *   · `BoardDayActions` (publicar, reservar, liberar, acuñar y servicios).
 *
 * Acceso: owner y recepción (decisión del responsable). Publicar y acuñar se comprueban además con
 * el rol del operador: recepción los ve deshabilitados.
 */

const FIELD =
  "min-h-touch rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";

/** Fecha de hoy en UTC `YYYY-MM-DD` (la misma zona con la que el servidor clasifica los días). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rótulo del periodo activo, localizado (zona UTC). */
function headingFor(view: BoardView, range: BoardRange, locale: string): string {
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(new Date(`${iso}T00:00:00Z`));
  switch (view) {
    case "DAY":
      return fmt(range.from, { dateStyle: "full" });
    case "WEEK":
      return `${fmt(range.from, { day: "numeric", month: "short" })} – ${fmt(range.to, { day: "numeric", month: "short" })}`;
    case "MONTH":
      return fmt(range.from, { month: "long", year: "numeric" });
    case "QUARTER": {
      const { year, month } = isoParts(range.from);
      return `T${Math.floor((month - 1) / 3) + 1} ${year}`;
    }
  }
}

export function RoomsBoardAdmin() {
  const t = useTranslations("rooms");
  const ta = useTranslations("admin");
  const locale = useLocale();
  const { apiFetch, hasRole } = useAdminContext();

  const [view, setView] = useState<BoardView>("MONTH");
  const [anchor, setAnchor] = useState<string>(todayIso());
  const [days, setDays] = useState<readonly BoardDayTotals[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayDetail | null>(null);
  const [action, setAction] = useState<BoardDayAction>("PUBLISH");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<BoardNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);

  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const heading = useMemo(() => headingFor(view, range, locale), [view, range, locale]);
  const canPublish = hasRole("DEFAULT_ADMIN_ROLE");
  const canMint = hasRole("MINTER_ROLE");

  const loadTotals = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/rooms/calendar?from=${range.from}&to=${range.to}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || ta("boardEmpty"));
      setDays(Array.isArray(data.days) ? (data.days as BoardDayTotals[]) : []);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardEmpty") });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, range.from, range.to, ta]);

  const loadDay = useCallback(
    async (date: string): Promise<void> => {
      setDayLoading(true);
      try {
        const res = await apiFetch(`/api/admin/rooms/calendar?date=${date}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || ta("boardEmpty"));
        setDay(data as DayDetail);
      } catch (error: unknown) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : ta("boardEmpty") });
        setDay(null);
      } finally {
        setDayLoading(false);
      }
    },
    [apiFetch, ta],
  );

  useEffect(() => {
    void loadTotals();
  }, [loadTotals]);

  useEffect(() => {
    if (selectedDate) void loadDay(selectedDate);
    else setDay(null);
  }, [selectedDate, loadDay]);

  // Cambiar de acción o de día invalida la selección: lo elegible cambia con el contexto.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [action, selectedDate]);

  const reloadDay = useCallback(async (): Promise<void> => {
    if (selectedDate) await loadDay(selectedDate);
    await loadTotals();
  }, [selectedDate, loadDay, loadTotals]);

  const rooms = useMemo(() => day?.rooms ?? [], [day]);
  const eligible = useMemo(
    () => rooms.filter((room) => isDayRoomEligible(room, action)).map((room) => room.id),
    [rooms, action],
  );
  const selectedRooms = useMemo(() => rooms.filter((room) => selectedIds.has(room.id)), [rooms, selectedIds]);

  const allEligibleSelected = eligible.length > 0 && eligible.every((id) => selectedIds.has(id));

  const toggle = (roomId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const shift = (delta: number): void => {
    const step = Math.max(1, enumerateDates(range).length);
    setAnchor(addDays(anchor, delta * step));
  };

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p
          data-testid="board-notice"
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "text-coral-text" : "text-azure-deep"}
        >
          {notice.text}
        </p>
      )}

      <AdminCard>
        {loading && (
          <p role="status" className="mb-2 text-small text-ink-soft">
            {t("loading")}
          </p>
        )}
        <CalendarioHabitaciones
          days={days}
          view={view}
          onViewChange={setView}
          onShift={shift}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          heading={heading}
          locale={locale}
        />
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{ta("boardDayTitle")}</h2>
        {!selectedDate ? (
          <p className="mt-2 text-ink-soft">{ta("boardDayPick")}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-small text-ink-soft" data-testid="board-day-summary">
              {day
                ? ta("boardSummary", {
                    published: day.summary.published,
                    reserved: day.summary.reserved,
                    occupied: day.summary.occupied,
                    maintenance: day.summary.maintenance,
                  })
                : t("loading")}
            </p>

            <BoardDayActions
              date={selectedDate}
              selectedRooms={selectedRooms}
              action={action}
              onActionChange={setAction}
              canPublish={canPublish}
              canMint={canMint}
              onNotice={setNotice}
              onReload={reloadDay}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-small font-semibold text-ink">{ta("boardRoomsTitle")}</h3>
              <div className="flex items-center gap-2">
                <span className="text-small text-ink-soft">
                  {ta("boardSelectedCount", { count: selectedIds.size })}
                </span>
                {eligible.length > 0 && (
                  <button
                    type="button"
                    data-testid="board-select-eligible"
                    onClick={() => setSelectedIds(allEligibleSelected ? new Set() : new Set(eligible))}
                    className={FIELD}
                  >
                    {ta("boardSelectEligible", { count: eligible.length })}
                  </button>
                )}
              </div>
            </div>

            {dayLoading ? (
              <p role="status" className="text-ink-soft">
                {t("loading")}
              </p>
            ) : rooms.length === 0 ? (
              <p className="text-ink-soft">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line" data-testid="board-room-list">
                {rooms.map((room) => {
                  const canSelect = isDayRoomEligible(room, action);
                  return (
                    <li key={room.id} className="flex items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        data-testid={`board-room-${room.roomNumber}`}
                        checked={selectedIds.has(room.id)}
                        disabled={!canSelect}
                        onChange={() => toggle(room.id)}
                        aria-label={`${t("colNumber")} ${room.roomNumber}`}
                        className="h-4 w-4 disabled:opacity-30"
                      />
                      <span className="w-16 font-semibold text-ink">{room.roomNumber}</span>
                      <span className="flex flex-wrap items-center gap-2 text-small text-ink-soft">
                        {room.published && (
                          <span className="inline-flex items-center gap-1 text-success">
                            <PublishedIcon size={14} />
                            {ta("boardLegendPublished")}
                          </span>
                        )}
                        {room.reserved && (
                          <span className="inline-flex items-center gap-1 text-info">
                            <ReservedIcon size={14} />
                            {ta("boardLegendReserved")}
                          </span>
                        )}
                        {room.occupied && (
                          <span className="inline-flex items-center gap-1 text-ink-soft">
                            <OccupiedIcon size={14} />
                            {ta("boardLegendOccupied")}
                          </span>
                        )}
                        {room.maintenance && (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <MaintenanceIcon size={14} />
                            {ta("boardLegendMaintenance")}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
