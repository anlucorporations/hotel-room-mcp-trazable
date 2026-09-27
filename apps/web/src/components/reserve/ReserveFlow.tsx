"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { WalletBar } from "@/components/wallet/WalletBar";

interface PublicRoom {
  id: string;
  roomNumber: number;
  roomType: string;
  baseRateWei: string | null;
}

interface Payment {
  amountCents: number;
  reference: string;
  deadline: string;
}

interface ReservationStatus {
  id: string;
  roomNumber: number;
  checkInDate: string;
  checkOutDate: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
  totalCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
  holdExpiresAt: string | null;
}

interface SettlementPlan {
  assigned: Array<{ nightDate: string; tokenId: string }>;
  needsMint: string[];
  conflicts: string[];
}

/** Fecha local en `YYYY-MM-DD`. */
function todayIso(offsetDays = 0): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function eur(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

/**
 * Flujo de **reserva con wallet** de la suite pública (F6 · D-65, D-72).
 *
 * La wallet se conecta **al inicio** (D-72): sin ella no se puede retener. Después el huésped elige
 * habitación y fechas, el sistema **retiene la noche** (D-35) y muestra las **instrucciones del
 * anticipo** (transferencia, importe, referencia y plazo). La **liquidación** se concilia al 100 %
 * (D-57) y el pago lo firma la wallet al comprar el token (D-60).
 */
export function ReserveFlow() {
  const t = useTranslations("reserve");
  const { isConnected, isWrongNetwork, address } = useOnboarding();

  const [rooms, setRooms] = useState<readonly PublicRoom[]>([]);
  const [form, setForm] = useState({ roomId: "", checkInDate: todayIso(1), checkOutDate: todayIso(2), email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; payment: Payment } | null>(null);
  const [status, setStatus] = useState<ReservationStatus | null>(null);
  const [plan, setPlan] = useState<SettlementPlan | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/public/rooms")
      .then((res) => res.json().catch(() => ({})))
      .then((data: { rooms?: PublicRoom[] }) => {
        if (!active) return;
        const list = data.rooms ?? [];
        setRooms(list);
        if (list.length > 0) setForm((current) => ({ ...current, roomId: current.roomId || list[0]!.id }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const refreshStatus = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/public/reservations/${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { reservation?: ReservationStatus };
    if (data.reservation) setStatus(data.reservation);
  }, []);

  useEffect(() => {
    if (created) void refreshStatus(created.id);
  }, [created, refreshStatus]);

  const reserve = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, wallet: address }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("error"));
      setCreated({ id: (data as { reservation: { id: string } }).reservation.id, payment: (data as { payment: Payment }).payment });
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const settle = async (): Promise<void> => {
    if (!created) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/reservations/${created.id}/settle`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setPlan((data as { plan?: SettlementPlan }).plan ?? null);
        throw new Error((data as { message?: string }).message || t("settleError"));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("settleError"));
      setPlan((data as { plan: SettlementPlan }).plan);
      await refreshStatus(created.id);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("settleError"));
    } finally {
      setBusy(false);
    }
  };

  if (!isConnected || isWrongNetwork) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-soft">{t("walletFirst")}</p>
        <WalletBar />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={reserve} className="flex flex-col gap-3 rounded-brand-lg border border-line bg-shell p-5">
        <label className="flex flex-col gap-1 text-small">
          <span className="font-medium text-ink">{t("room")}</span>
          <select
            value={form.roomId}
            onChange={(event) => setForm({ ...form, roomId: event.target.value })}
            data-testid="reserve-room"
            className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
          >
            {rooms.length === 0 && <option value="">{t("noRooms")}</option>}
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {t("roomOption", { room: room.roomNumber, type: room.roomType })}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("checkIn")}</span>
            <input
              type="date"
              required
              value={form.checkInDate}
              onChange={(event) => setForm({ ...form, checkInDate: event.target.value })}
              className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("checkOut")}</span>
            <input
              type="date"
              required
              value={form.checkOutDate}
              onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })}
              className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("email")}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder={t("emailPlaceholder")}
              className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !form.roomId}
          className="min-h-touch self-start rounded-pill bg-sea px-5 text-small font-semibold text-shell disabled:opacity-50"
        >
          {busy ? t("reserving") : t("reserve")}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      {created && (
        <section aria-labelledby="reserve-created" className="flex flex-col gap-3 rounded-brand-lg border border-line bg-sand-2 p-5">
          <h2 id="reserve-created" className="font-display text-h3 font-semibold text-ink">{t("heldTitle")}</h2>
          <p className="text-small text-ink">{t("heldBody", { reference: created.payment.reference })}</p>
          <dl className="grid gap-1 text-small">
            <div className="flex gap-2"><dt className="font-medium text-ink">{t("deposit")}:</dt><dd className="text-ink">{eur(created.payment.amountCents)}</dd></div>
            <div className="flex gap-2"><dt className="font-medium text-ink">{t("deadline")}:</dt><dd className="text-ink">{new Date(created.payment.deadline).toLocaleString()}</dd></div>
            <div className="flex gap-2"><dt className="font-medium text-ink">{t("reference")}:</dt><dd className="text-ink">{created.payment.reference}</dd></div>
          </dl>
          <p className="text-small text-ink-soft">{t("transferInstructions")}</p>

          {status && (
            <p className="text-small text-ink" data-testid="reserve-status">
              {t("statusLine", { status: t(`status.${status.status}` as "status.PENDING"), paid: eur(status.depositPaidCents), due: eur(status.depositRequiredCents) })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshStatus(created.id)}
              className="min-h-touch rounded-pill border border-line px-4 text-small font-semibold text-ink-soft"
            >
              {t("refresh")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void settle()}
              className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell disabled:opacity-50"
            >
              {t("settle")}
            </button>
          </div>

          {plan && (
            <p className="text-small text-ink-soft" data-testid="reserve-plan">
              {t("planLine", { assigned: plan.assigned.length, needsMint: plan.needsMint.length })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
