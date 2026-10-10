"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { AdminCard } from "@/components/admin/AdminPanel";
import { CalendarioHabitaciones } from "@/components/rooms/CalendarioHabitaciones";
import {
  addDays,
  enumerateDates,
  isoParts,
  rangeForView,
  type BoardDayAction,
  type BoardDayTotals,
  type BoardRange,
  type BoardView,
} from "@/lib/room-board-calendar";
import { BoardDayDialog } from "./BoardDayDialog";
import type { BoardNotice, DayDetail } from "./board-dto";

/**
 * **Tablero de disponibilidad** del back-office (2026-10-04, subsección «Publicar»).
 *
 * Es el contenedor: mantiene la vista (día/semana/mes/trimestre), el periodo, el día seleccionado y
 * la selección de habitaciones; pide los agregados a `GET /api/admin/rooms/calendar`; y compone:
 *   · `CalendarioHabitaciones` (mapa reutilizable, solo presentación);
 *   · `BoardDayDialog`, la **gestión del día en flotante** (2026-10-10): al elegir un día se abre
 *     sobre el calendario con el resumen, las acciones y las habitaciones (con su tipo).
 *
 * Acceso: owner y recepción (decisión del responsable). Publicar y acuñar se comprueban además con
 * el rol del operador: recepción los ve deshabilitados.
 */

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
      {/* El aviso vive en el panel cuando está abierto (es lo que el operador ve); si no, aquí. */}
      {notice && !selectedDate && (
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
        {!selectedDate && <p className="mt-3 text-ink-soft">{ta("boardDayPick")}</p>}
      </AdminCard>

      {/* Gestión del día **en flotante** (2026-10-10): se abre al elegir un día del calendario. */}
      {selectedDate !== null && (
        <BoardDayDialog
          date={selectedDate}
          day={day}
          loading={dayLoading}
          action={action}
          onActionChange={setAction}
          selectedIds={selectedIds}
          onToggle={toggle}
          onSelectionChange={setSelectedIds}
          canPublish={canPublish}
          canMint={canMint}
          notice={notice}
          onNotice={setNotice}
          onReload={reloadDay}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
