"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminSession } from "@/components/admin/useAdminSession";
import { MODAL_PRIMARY, MODAL_SECONDARY, ModalShell } from "@/components/ui/ModalShell";

/** Estado de la ficha detalle (RF-51); el servidor lo devuelve explícitamente. */
type RoomDetailState = "LIBRE" | "RESERVADA" | "OCUPADA" | "MANTENIMIENTO" | "PENDIENTE_LIMPIEZA";

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
  state: RoomDetailState;
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

/** Recorta la wallet para no exponer la dirección completa (RF-52 · confidencialidad). */
function maskWallet(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

/**
 * **Ficha detalle de una habitación** (CU-39 · RF-51..RF-55).
 *
 * Es un diálogo flotante con la estructura común: **título** (habitación, tipo y estado), **cuerpo**
 * (Zona Habitación y Zona Huésped) y **pie** (liberar la habitación y cerrar).
 */
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
  const tCommon = useTranslations("common");
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
      const res = await apiFetch(`/api/reception/rooms/${roomNumber}/release`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || t("releaseError"));
      onRelease?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("releaseError"));
    } finally {
      setReleasing(false);
    }
  };

  const close = (): void => onClose?.();
  const room = data?.room;
  const state = data?.state;
  const canRelease = state === "PENDIENTE_LIMPIEZA";

  /** Checklist de preparación (RESERVADA · LIBRE · PENDIENTE_LIMPIEZA). */
  const checklistBlock = data ? (
    <>
      <h4 className="mb-1 text-small font-semibold uppercase tracking-wide text-ink-soft">
        {t("checklistTitle")}
      </h4>
      <ul className="space-y-1">
        {data.checklist.map((item) => (
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
    </>
  ) : null;

  return (
    <ModalShell
      testId="room-detail-dialog"
      title={t("roomDetailTitle", { roomNumber })}
      subtitle={
        room ? (
          <>
            {room.roomType} ·{" "}
            <span data-testid="room-detail-state" className="font-semibold text-ink">
              {t(`detailState${state}` as "detailStateLIBRE")}
            </span>
          </>
        ) : undefined
      }
      closeLabel={tCommon("close")}
      onClose={close}
      panelClassName="max-w-4xl"
      footerTestId="room-detail-footer"
      footer={
        <>
          {canRelease && (
            <button
              type="button"
              data-testid="room-detail-release"
              onClick={() => void release()}
              disabled={releasing}
              className={MODAL_PRIMARY}
            >
              {releasing ? t("releasing") : t("releaseRoom")}
            </button>
          )}
          <button type="button" onClick={close} className={MODAL_SECONDARY}>
            {tCommon("close")}
          </button>
        </>
      }
    >
      {loading && <p className="text-ink-soft">{t("loading")}</p>}

      {!loading && error && (
        <p role="alert" className="rounded-brand border border-coral-text/40 bg-mist-2 p-4 text-coral-text">
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <div className="grid gap-6 tablet:grid-cols-2">
          {/* ── Zona Habitación (contenido según el estado, RF-51) ── */}
          <div>
            <h3 className="mb-2 font-display text-h4 font-semibold">{t("zoneRoom")}</h3>

            {state === "MANTENIMIENTO" && (
              <div
                data-testid="room-zone-maintenance"
                className="rounded-brand border border-coral-text/30 bg-coral-text/10 p-3 text-coral-text"
              >
                <p className="font-semibold">{t("maintenanceInProgress")}</p>
                <p className="text-small">
                  {data.maintenance?.description || data.maintenance?.kind || "—"}
                </p>
              </div>
            )}

            {state === "OCUPADA" && (
              <div data-testid="room-zone-calendar">
                <h4 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-soft">
                  {t("occupationCalendar")}
                </h4>
                {data.calendar && data.calendar.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2 tablet:grid-cols-3">
                    {data.calendar.map((day) => (
                      <li
                        key={day.date}
                        data-testid={`calendar-day-${day.date}`}
                        className="rounded-brand border border-line bg-shell p-2 text-micro"
                      >
                        <span className="block font-semibold">{day.date.slice(5)}</span>
                        <span className="mt-1 flex gap-1.5">
                          <span
                            data-done={day.cleaning}
                            title={t("iconCleaning")}
                            className={day.cleaning ? "opacity-100" : "opacity-25"}
                          >
                            🧹
                          </span>
                          <span
                            data-done={day.maintenance}
                            title={t("iconMaintenance")}
                            className={day.maintenance ? "opacity-100" : "opacity-25"}
                          >
                            🔧
                          </span>
                          <span
                            data-done={day.charges}
                            title={t("iconCharges")}
                            className={day.charges ? "opacity-100" : "opacity-25"}
                          >
                            €
                          </span>
                          <span
                            data-done={day.notes}
                            title={t("iconNotes")}
                            className={day.notes ? "opacity-100" : "opacity-25"}
                          >
                            📝
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small text-ink-soft">{t("calendarEmpty")}</p>
                )}
              </div>
            )}

            {(state === "RESERVADA" || state === "LIBRE" || state === "PENDIENTE_LIMPIEZA") && (
              <div data-testid="room-zone-checklist">
                {state === "PENDIENTE_LIMPIEZA" && (
                  <p className="mb-2 text-small text-coral-text">{t("pendingCleaningHint")}</p>
                )}
                {state === "RESERVADA" && (
                  <p className="mb-2 text-small text-ink-soft">{t("preArrivalHint")}</p>
                )}
                {checklistBlock}
              </div>
            )}
          </div>

          {/* ── Zona Huésped (RF-52) ── */}
          <div>
            <h3 className="mb-2 font-display text-h4 font-semibold">{t("zoneGuest")}</h3>
            {data.reservation ? (
              <dl data-testid="room-zone-guest" className="space-y-2 text-small">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestDates")}</dt>
                  <dd>
                    {data.reservation.checkInDate} → {data.reservation.checkOutDate}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestAdults")}</dt>
                  <dd>{data.reservation.adultCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestChildren")}</dt>
                  <dd>{data.reservation.childCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestBabies")}</dt>
                  <dd>{data.reservation.babyCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestPets")}</dt>
                  <dd>{data.reservation.petCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">{t("guestAccessibility")}</dt>
                  <dd>{data.reservation.accessibilityCount}</dd>
                </div>
                {data.reservation.currentOwner && (
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">{t("guestWallet")}</dt>
                    <dd data-testid="guest-wallet" className="font-mono text-micro">
                      {maskWallet(data.reservation.currentOwner)}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-ink-soft">{t("noActiveReservation")}</p>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}
