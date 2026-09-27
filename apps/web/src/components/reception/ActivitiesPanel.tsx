"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Schedule {
  id: string;
  startsAt: string;
  capacity: number;
  activityNameEs: string;
  priceCents: number;
  currency: string;
  bookedSeats: number;
  waitlistSeats: number;
  remaining: number;
}
interface Booking {
  id: string;
  reservationId: string;
  seats: number;
  status: "BOOKED" | "WAITLIST" | "CANCELLED" | "ATTENDED";
}
interface ReservationOption {
  id: string;
  roomNumber: number;
  status: string;
}

/** Fecha local del puesto, formato ISO `YYYY-MM-DD`. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Inscripción en actividades desde Front Office (F5 · D-44…D-47).
 *
 * La recepción elige el horario del día, ve su **ocupación real** y el estado de la **lista de
 * espera**, e inscribe a un huésped con estancia activa; el cargo va al folio (D-46). Al cancelar, la
 * primera plaza en espera se promociona sola y se avisa aquí (D-47).
 */
export function ActivitiesPanel({
  apiFetch,
}: {
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const t = useTranslations("activities");
  const [date, setDate] = useState<string>(todayIso);
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [bookings, setBookings] = useState<readonly Booking[]>([]);
  const [reservations, setReservations] = useState<readonly ReservationOption[]>([]);
  const [form, setForm] = useState({ reservationId: "", seats: 1, allowWaitlist: false });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSchedules = useCallback(
    async (targetDate: string): Promise<void> => {
      setError(null);
      try {
        const res = await apiFetch(`/api/reception/actividades/schedules?date=${encodeURIComponent(targetDate)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { message?: string }).message || t("loadError"));
        const list = ((data as { schedules?: Schedule[] }).schedules ?? []) as readonly Schedule[];
        setSchedules(list);
        setSelected((current) => (list.some((s) => s.id === current) ? current : (list[0]?.id ?? "")));
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("loadError"));
      }
    },
    [apiFetch, t],
  );

  useEffect(() => {
    void loadSchedules(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    let active = true;
    apiFetch("/api/reception/reservations?status=CONFIRMED")
      .then((res) => res.json().catch(() => ({})))
      .then((data: { reservations?: ReservationOption[] }) => {
        if (!active) return;
        const confirmed = (data.reservations ?? []).filter((reservation) => reservation.status === "CONFIRMED");
        setReservations(confirmed);
        if (confirmed.length > 0) setForm((current) => ({ ...current, reservationId: current.reservationId || confirmed[0]!.id }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiFetch]);

  const loadBookings = useCallback(
    async (scheduleId: string): Promise<void> => {
      if (!scheduleId) {
        setBookings([]);
        return;
      }
      try {
        const res = await apiFetch(`/api/reception/actividades/bookings?scheduleId=${encodeURIComponent(scheduleId)}`);
        const data = await res.json().catch(() => ({}));
        setBookings((data as { bookings?: Booking[] }).bookings ?? []);
      } catch {
        setBookings([]);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    void loadBookings(selected);
  }, [selected, loadBookings]);

  const book = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selected || !form.reservationId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/reception/actividades/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId: selected, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("bookError"));
      const status = (data as { booking?: Booking }).booking?.status;
      setNotice(status === "WAITLIST" ? t("bookedWaitlist") : t("booked"));
      await loadSchedules(date);
      await loadBookings(selected);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("bookError"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (booking: Booking): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/reception/actividades/bookings/${booking.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("cancelError"));
      const promoted = (data as { promoted?: Booking | null }).promoted;
      setNotice(promoted ? t("promoted") : t("cancelled"));
      await loadSchedules(date);
      await loadBookings(selected);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("cancelError"));
    } finally {
      setBusy(false);
    }
  };

  const current = schedules.find((schedule) => schedule.id === selected);

  return (
    <section aria-labelledby="activities-panel-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="activities-panel-title" className="font-display text-h3 font-semibold text-ink">
          {t("receptionTitle")}
        </h2>
        <label className="flex items-center gap-2 text-small">
          <span className="font-medium text-ink">{t("date")}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            data-testid="activities-date"
            className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-small text-olive">
          {notice}
        </p>
      )}

      {schedules.length === 0 ? (
        <p className="text-small text-ink-soft">{t("noSchedulesToday")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {schedules.map((schedule) => (
            <button
              key={schedule.id}
              type="button"
              onClick={() => setSelected(schedule.id)}
              aria-pressed={schedule.id === selected}
              className={`min-h-touch rounded-pill px-4 text-small font-semibold ${schedule.id === selected ? "bg-sea text-shell" : "border border-line text-ink-soft"}`}
            >
              {schedule.activityNameEs} · {new Date(schedule.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {t("remaining", { count: schedule.remaining })}
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          <p className="text-small text-ink-soft">
            {t("occupancyDetail", { booked: current.bookedSeats, capacity: current.capacity, waitlist: current.waitlistSeats })}
          </p>

          <form onSubmit={book} className="flex flex-wrap items-end gap-3 rounded-brand-lg border border-line bg-shell p-4">
            <label className="flex min-w-[14rem] flex-col gap-1 text-small">
              <span className="font-medium text-ink">{t("guest")}</span>
              <select
                value={form.reservationId}
                onChange={(event) => setForm({ ...form, reservationId: event.target.value })}
                data-testid="activities-reservation"
                className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
              >
                {reservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    {t("room")} {reservation.roomNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small">
              <span className="font-medium text-ink">{t("seats")}</span>
              <input
                type="number"
                min={1}
                value={form.seats}
                onChange={(event) => setForm({ ...form, seats: Number(event.target.value) })}
                className="min-h-touch w-20 rounded-brand-sm border border-line bg-sand px-3"
              />
            </label>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={form.allowWaitlist}
                onChange={(event) => setForm({ ...form, allowWaitlist: event.target.checked })}
                className="h-5 w-5"
              />
              <span className="text-ink">{t("allowWaitlist")}</span>
            </label>
            <button
              type="submit"
              disabled={busy || !form.reservationId}
              className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell disabled:opacity-50"
            >
              {t("book")}
            </button>
          </form>

          {bookings.length > 0 && (
            <ul className="flex flex-col gap-2">
              {bookings.map((booking) => (
                <li key={booking.id} className="flex flex-wrap items-center gap-2 rounded-brand-lg border border-line bg-sand-2 px-4 py-2 text-small">
                  <span className="text-ink">{t("room")} {reservations.find((r) => r.id === booking.reservationId)?.roomNumber ?? "—"}</span>
                  <span className="text-micro text-ink-soft">{booking.seats} {t("seats")}</span>
                  <span className="rounded-pill bg-shell px-2 py-0.5 text-micro font-semibold text-ink-soft">
                    {t(booking.status === "WAITLIST" ? "statusWaitlist" : "statusBooked")}
                  </span>
                  {booking.status !== "CANCELLED" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancel(booking)}
                      className="ml-auto min-h-touch rounded-pill border border-line px-3 text-small font-semibold text-ink-soft disabled:opacity-40"
                    >
                      {t("cancelBooking")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
