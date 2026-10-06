"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminSession } from "@/components/admin/useAdminSession";

interface RoomDetail {
  room: {
    id: string;
    roomNumber: number;
    roomType: string;
    operationalStatus: string;
    isAccessible: boolean;
    viewKind: string | null;
    hasBalcony: boolean;
  };
  checklist: Array<{
    code: string;
    nameEs: string;
    isMandatory: boolean;
    completed: boolean;
    completedBy: string | null;
    completedAt: string | null;
    notes: string | null;
  }>;
  reservation: {
    id: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
    adultCount: number;
    childCount: number;
    babyCount: number;
    petCount: number;
    accessibilityCount: number;
    tokenId: string | null;
    currentOwner: string | null;
  } | null;
  maintenance: {
    id: string;
    kind: string;
    description: string | null;
    priority: string;
    status: string;
  } | null;
  calendar: Array<{
    date: string;
    cleaning: boolean;
    maintenance: boolean;
    charges: boolean;
    notes: boolean;
  }> | null;
}

export function RoomDetailPanel({
  roomNumber,
  apiFetch,
  onRelease,
  onClose,
}: {
  roomNumber: number;
  apiFetch: AdminSession["apiFetch"];
  onRelease?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("reception");
  const [data, setData] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/reception/rooms/${roomNumber}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || t("loadError"));
        if (!cancelled) setData(json as RoomDetail);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomNumber, apiFetch, t]);

  const release = async () => {
    setReleasing(true);
    try {
      const res = await apiFetch(`/api/reception/rooms/${roomNumber}/release`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || t("releaseError"));
      onRelease?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("releaseError"));
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return <p className="text-ink-soft">{t("loading")}</p>;
  }

  if (error) {
    return (
      <div className="rounded-brand border border-coral-text/40 bg-mist-2 p-4 text-coral-text">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { room, checklist, reservation, maintenance, calendar } = data;
  const canRelease = room.operationalStatus === "PENDING_CLEANING";

  return (
    <section className="rounded-brand-lg border border-line bg-shell p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-h3 font-semibold">
            {t("roomDetailTitle", { roomNumber: room.roomNumber })}
          </h2>
          <p className="text-small text-ink-soft">
            {room.roomType} · {t(`roomStatus${room.operationalStatus}` as "roomStatusCLEAN")}
          </p>
        </div>
        <div className="flex gap-2">
          {canRelease && (
            <button
              type="button"
              onClick={release}
              disabled={releasing}
              className="min-h-touch rounded-pill bg-fern px-4 font-semibold text-shell disabled:opacity-60"
            >
              {releasing ? t("releasing") : t("releaseRoom")}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-touch rounded-pill border border-line px-4 font-semibold text-ink-soft"
            >
              {t("close")}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 tablet:grid-cols-2">
        {/* Zona Habitación */}
        <div>
          <h3 className="mb-2 font-display text-h4 font-semibold">{t("zoneRoom")}</h3>

          {maintenance && (
            <div className="mb-4 rounded-brand border border-coral-text/30 bg-coral-text/10 p-3 text-coral-text">
              <p className="font-semibold">{t("maintenanceInProgress")}</p>
              <p className="text-small">{maintenance.description || maintenance.kind}</p>
            </div>
          )}

          <h4 className="mb-1 text-small font-semibold uppercase tracking-wide text-ink-soft">
            {t("checklistTitle")}
          </h4>
          <ul className="mb-4 space-y-1">
            {checklist.map((item) => (
              <li key={item.code} className="flex items-center justify-between text-small">
                <span className={item.completed ? "text-ink" : "text-ink-soft"}>
                  {item.nameEs}
                  {!item.isMandatory && (
                    <span className="ml-1 text-micro text-ink-soft">({t("optional")})</span>
                  )}
                </span>
                <span className={item.completed ? "text-fern" : "text-ink-soft"}>
                  {item.completed ? "✓" : "—"}
                </span>
              </li>
            ))}
          </ul>

          {calendar && (
            <>
              <h4 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-soft">
                {t("occupationCalendar")}
              </h4>
              <ul className="grid grid-cols-2 gap-2 tablet:grid-cols-3">
                {calendar.map((day) => (
                  <li key={day.date} className="rounded-brand border border-line bg-shell p-2 text-micro">
                    <span className="block font-semibold">{day.date.slice(5)}</span>
                    <span className="flex gap-1 text-ink-soft">
                      {day.cleaning && <span title={t("iconCleaning")}>🧹</span>}
                      {day.maintenance && <span title={t("iconMaintenance")}>🔧</span>}
                      {day.charges && <span title={t("iconCharges")}>€</span>}
                      {day.notes && <span title={t("iconNotes")}>📝</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Zona Huésped */}
        <div>
          <h3 className="mb-2 font-display text-h4 font-semibold">{t("zoneGuest")}</h3>
          {reservation ? (
            <dl className="space-y-2 text-small">
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestDates")}</dt>
                <dd>
                  {reservation.checkInDate} → {reservation.checkOutDate}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestAdults")}</dt>
                <dd>{reservation.adultCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestChildren")}</dt>
                <dd>{reservation.childCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestBabies")}</dt>
                <dd>{reservation.babyCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestPets")}</dt>
                <dd>{reservation.petCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">{t("guestAccessibility")}</dt>
                <dd>{reservation.accessibilityCount}</dd>
              </div>
              {reservation.currentOwner && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestWallet")}</dt>
                  <dd className="font-mono text-micro">{`${reservation.currentOwner.slice(0, 10)}…`}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-ink-soft">{t("noActiveReservation")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
