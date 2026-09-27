"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { CredentialForm } from "@/components/admin/CredentialForm";
import { CheckInPanel } from "./CheckInPanel";
import { CheckoutPanel } from "./CheckoutPanel";
import { DayBoard } from "./DayBoard";
import { ReportIncidentPanel } from "@/components/maintenance/ReportIncidentPanel";
import { ActivitiesPanel } from "./ActivitiesPanel";
import type { DayStats, OverviewResponse, Reservation, RoomCell } from "./types";

type Tab = "today" | "checkin" | "checkout" | "activities";

/** Fecha local en formato ISO `YYYY-MM-DD` (la del puesto de recepción, no UTC). */
function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * MVP del puesto de recepción (RF-31..RF-38, CU-31..CU-35).
 *
 * Exige sesión de `RECEPTION_ROLE` o del owner (D-37) en toda la pantalla: sin sesión solo se
 * muestra el acceso canónico (D-04) y no se lee ningún dato. Con sesión, carga el panel del día
 * (PostgreSQL, D-31) y da acceso al check-in y al check-out.
 */
export function ReceptionDashboard() {
  const t = useTranslations("reception");
  const session = useAdminSession();
  const { sessionUsername, isLoading } = session;

  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState<string>(todayIso);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(
    async (targetDate: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await session.apiFetch(
          `/api/reception/overview?date=${encodeURIComponent(targetDate)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || t("loadError"));
        setOverview(data as OverviewResponse);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t("loadError"));
      } finally {
        setLoading(false);
      }
    },
    [session, t],
  );

  const allowed = session.hasRole("RECEPTION_ROLE");

  useEffect(() => {
    if (sessionUsername && allowed) void loadOverview(date);
    // `session.apiFetch` es estable; recargar solo al cambiar fecha/sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUsername, allowed, date]);

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
        <h2 className="font-display text-h3 font-semibold">{t("gateTitle")}</h2>
        <CredentialForm session={session} />
      </div>
    );
  }

  if (!allowed) {
    return (
      <p data-testid="reception-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDenied")}
      </p>
    );
  }

  const reservations: readonly Reservation[] = overview?.reservations ?? [];
  const rooms: readonly RoomCell[] = overview?.rooms ?? [];
  const stats: DayStats | null = overview?.stats ?? null;
  const refresh = (): void => void loadOverview(date);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-ink-soft">{t("signedAs", { username: sessionUsername })}</p>

      <div role="tablist" aria-label={t("tabsLabel")} className="flex rounded-pill border border-line bg-sand-2 p-1">
        {(["today", "checkin", "checkout", "activities"] as const).map((item) => (
          <button
            key={item}
            role="tab"
            type="button"
            aria-selected={tab === item}
            data-testid={`reception-tab-${item}`}
            onClick={() => setTab(item)}
            className={`min-h-touch flex-1 rounded-pill px-4 text-small font-semibold transition ${
              tab === item ? "bg-sea text-shell shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t(`tab${item.charAt(0).toUpperCase()}${item.slice(1)}` as "tabToday")}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <>
          <DayBoard
            date={date}
            onDateChange={setDate}
            onRefresh={refresh}
            loading={loading}
            error={error}
            reservations={reservations}
            rooms={rooms}
            stats={stats}
          />
          {/* D-52: recepción reporta averías; la habitación se bloquea hasta que el técnico resuelva (D-53). */}
          <ReportIncidentPanel apiFetch={session.apiFetch} />
        </>
      )}

      {tab === "checkin" && <CheckInPanel apiFetch={session.apiFetch} onDone={refresh} />}

      {tab === "checkout" && (
        <CheckoutPanel
          apiFetch={session.apiFetch}
          reservations={reservations.filter((item) => item.status === "CHECKED_IN")}
          onDone={refresh}
        />
      )}

      {tab === "activities" && <ActivitiesPanel apiFetch={session.apiFetch} />}
    </div>
  );
}
