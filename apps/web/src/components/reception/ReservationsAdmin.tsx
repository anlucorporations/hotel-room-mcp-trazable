"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { CredentialForm } from "@/components/admin/CredentialForm";
import { AdminCard } from "@/components/admin/AdminPanel";

/**
 * Motor de reservas del Front Office (F2 · D-34…D-43, D-55, D-57).
 *
 * Recepción crea la reserva (retiene las noches), consulta la disponibilidad exacta, confirma el
 * anticipo y cancela liberando inventario. La autoridad real la impone la API (`RECEPTION_ROLE`) y la
 * base de datos (índice único parcial, D-41). La UI es deliberadamente simple: la barra superior vive
 * en `FrontOfficeShell`.
 */

interface RoomOption {
  id: string;
  roomNumber: number;
  roomType: string;
}

interface Reservation {
  id: string;
  roomNumber: number;
  checkInDate: string;
  checkOutDate: string;
  channel: string;
  status: string;
  totalCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
}

type Notice = { kind: "ok" | "error"; text: string };

const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/** Fecha local en formato ISO `YYYY-MM-DD`. */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function ReservationsAdmin() {
  const t = useTranslations("reception");
  const session = useAdminSession();

  const [rooms, setRooms] = useState<readonly RoomOption[]>([]);
  const [reservations, setReservations] = useState<readonly Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [availability, setAvailability] = useState<boolean | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const allowed = session.hasRole("RECEPTION_ROLE");
  const { sessionUsername, isLoading } = session;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [roomsRes, reservationsRes] = await Promise.all([
        session.apiFetch("/api/reception/rooms"),
        session.apiFetch("/api/reception/reservations"),
      ]);
      const roomsData = await roomsRes.json().catch(() => ({}));
      const reservationsData = await reservationsRes.json().catch(() => ({}));
      if (roomsRes.ok) setRooms(roomsData.rooms ?? []);
      if (reservationsRes.ok) setReservations(reservationsData.reservations ?? []);
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    } finally {
      setLoading(false);
    }
  }, [session, t]);

  useEffect(() => {
    if (sessionUsername && allowed) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUsername, allowed]);

  async function checkAvailability(): Promise<void> {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const roomId = String(data.get("roomId") ?? "");
    const from = String(data.get("checkInDate") ?? "");
    const to = String(data.get("checkOutDate") ?? "");
    setAvailability(null);
    setNotice(null);
    if (!roomId || !from || !to) return;
    try {
      const res = await session.apiFetch(
        `/api/reception/availability?roomId=${encodeURIComponent(roomId)}&from=${from}&to=${to}`,
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t("loadError"));
      setAvailability(Boolean(payload.available));
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("loadError") });
    }
  }

  async function createReservation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreating(true);
    setNotice(null);
    try {
      const res = await session.apiFetch("/api/reception/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: String(form.get("roomId") ?? ""),
          checkInDate: String(form.get("checkInDate") ?? ""),
          checkOutDate: String(form.get("checkOutDate") ?? ""),
          totalCents: Math.round(Number(form.get("totalCents") ?? 0) * 100),
          contact: String(form.get("contactValue") ?? "").trim()
            ? {
                channel: String(form.get("contactChannel") ?? "EMAIL"),
                value: String(form.get("contactValue") ?? "").trim(),
              }
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("resCreateError"));
      setNotice({ kind: "ok", text: t("resCreated") });
      (event.target as HTMLFormElement).reset();
      setAvailability(null);
      await load();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("resCreateError") });
    } finally {
      setCreating(false);
    }
  }

  async function confirmReservation(id: string): Promise<void> {
    setNotice(null);
    try {
      const res = await session.apiFetch(`/api/reception/reservations/${id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("resConfirmError"));
      }
      await load();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("resConfirmError") });
    }
  }

  async function cancelReservation(id: string): Promise<void> {
    setNotice(null);
    try {
      const res = await session.apiFetch(`/api/reception/reservations/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: t("resCancelReason") }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || t("resCancelError"));
      }
      await load();
    } catch (error: unknown) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : t("resCancelError") });
    }
  }

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }
  if (!sessionUsername) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 rounded-brand-lg border border-line bg-shell p-6 shadow-card">
        <h2 className="font-display text-h3 font-semibold text-ink">{t("gateTitle")}</h2>
        <CredentialForm session={session} />
      </div>
    );
  }
  if (!allowed) {
    return (
      <p role="alert" data-testid="reception-role-denied" className="rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          data-testid="reservations-notice"
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "text-coral-text" : "text-azure-deep"}
        >
          {notice.text}
        </p>
      )}

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold text-ink">{t("resFormTitle")}</h2>
        <form ref={formRef} onSubmit={createReservation} className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-3">
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resRoom")}
            <select name="roomId" required data-testid="res-room" className={FIELD} defaultValue="">
              <option value="" disabled>
                —
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.roomNumber} · {room.roomType}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resCheckIn")}
            <input name="checkInDate" type="date" required defaultValue={todayIso()} data-testid="res-checkin" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resCheckOut")}
            <input name="checkOutDate" type="date" required data-testid="res-checkout" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resTotal")}
            <input name="totalCents" type="number" min="0" step="0.01" required data-testid="res-total" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resContactChannel")}
            <select name="contactChannel" data-testid="res-contact-channel" defaultValue="EMAIL" className={FIELD}>
              <option value="EMAIL">{t("resChannelEmail")}</option>
              <option value="WEB">{t("resChannelWeb")}</option>
              <option value="TELEGRAM">{t("resChannelTelegram")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-ink">
            {t("resContactValue")}
            <input name="contactValue" type="text" data-testid="res-contact-value" className={FIELD} />
          </label>
          <div className="flex flex-wrap gap-2 tablet:col-span-3">
            <button type="button" onClick={() => void checkAvailability()} className={GHOST}>
              {t("resCheckAvailability")}
            </button>
            <button type="submit" data-testid="res-create" disabled={creating} className={ACTION}>
              {creating ? t("resCreating") : t("resCreate")}
            </button>
          </div>
          {availability !== null && (
            <p role="status" className="tablet:col-span-3 text-small font-medium text-ink">
              {availability ? t("resAvailable") : t("resUnavailable")}
            </p>
          )}
        </form>
      </AdminCard>

      <AdminCard>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-h3 font-semibold text-ink">{t("resListTitle")}</h2>
          <button type="button" onClick={() => void load()} className={GHOST} disabled={loading}>
            {t("refresh")}
          </button>
        </div>
        {reservations.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t("resListEmpty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-small">
              <caption className="sr-only">{t("reservationsCaption")}</caption>
              <thead>
                <tr className="text-ink-soft">
                  <th scope="col" className="px-2 py-2">{t("colRoom")}</th>
                  <th scope="col" className="px-2 py-2">{t("resDates")}</th>
                  <th scope="col" className="px-2 py-2">{t("colStatus")}</th>
                  <th scope="col" className="px-2 py-2">{t("resTotal")}</th>
                  <th scope="col" className="px-2 py-2">{t("resActions")}</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
                  <tr key={reservation.id} data-testid={`res-row-${reservation.id}`} className="border-t border-line">
                    <td className="px-2 py-2 font-semibold text-ink">{reservation.roomNumber}</td>
                    <td className="px-2 py-2">
                      {reservation.checkInDate} → {reservation.checkOutDate}
                    </td>
                    <td className="px-2 py-2">{reservation.status}</td>
                    <td className="px-2 py-2">{euros(reservation.totalCents)} €</td>
                    <td className="flex flex-wrap gap-2 px-2 py-2">
                      {reservation.status === "PENDING" && (
                        <button type="button" onClick={() => void confirmReservation(reservation.id)} className={GHOST}>
                          {t("resConfirm")}
                        </button>
                      )}
                      {(reservation.status === "PENDING" || reservation.status === "CONFIRMED") && (
                        <button type="button" onClick={() => void cancelReservation(reservation.id)} className={GHOST}>
                          {t("resCancel")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
