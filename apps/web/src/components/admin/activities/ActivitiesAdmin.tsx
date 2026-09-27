"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";

interface Activity {
  id: string;
  code: string;
  nameEs: string;
  priceCents: number;
  currency: string;
  active: boolean;
}
interface Schedule {
  id: string;
  activityId: string;
  startsAt: string;
  capacity: number;
  active: boolean;
  activityCode: string;
  activityNameEs: string;
  bookedSeats: number;
  waitlistSeats: number;
  remaining: number;
}

/**
 * Administración del catálogo de actividades (F5 · D-44/D-47). Solo owner.
 *
 * El administrador da de alta actividades y sus **horarios con cupo estricto**; la recepción inscribe
 * desde Front Office. Los horarios muestran su ocupación y plazas libres, y se pueden abrir o cerrar.
 */
export function ActivitiesAdmin() {
  const t = useTranslations("activities");
  const session = useAdminSession();
  const [activities, setActivities] = useState<readonly Activity[]>([]);
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [form, setForm] = useState({ code: "", nameEs: "", priceCents: 0 });
  const [scheduleForm, setScheduleForm] = useState({ activityId: "", startsAt: "", capacity: 8 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [activitiesRes, schedulesRes] = await Promise.all([
        session.apiFetch("/api/admin/actividades/activities").then((res) => res.json().catch(() => ({}))),
        session.apiFetch("/api/admin/actividades/schedules").then((res) => res.json().catch(() => ({}))),
      ]);
      const list = ((activitiesRes as { activities?: Activity[] }).activities ?? []) as readonly Activity[];
      setActivities(list);
      setSchedules((schedulesRes as { schedules?: Schedule[] }).schedules ?? []);
      setScheduleForm((current) => (current.activityId || list.length === 0 ? current : { ...current, activityId: list[0]!.id }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [session, t]);

  useEffect(() => {
    if (session.sessionUsername) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionUsername]);

  if (session.isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }
  if (!session.sessionUsername || !session.hasRole("DEFAULT_ADMIN_ROLE")) {
    return (
      <p data-testid="activities-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDeniedAdmin")}
      </p>
    );
  }

  const createActivity = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await session.apiFetch("/api/admin/actividades/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("saveError"));
      setNotice(t("activityCreated", { code: form.code.toUpperCase() }));
      setForm({ code: "", nameEs: "", priceCents: 0 });
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("saveError"));
    }
  };

  const createSchedule = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!scheduleForm.startsAt) return;
    try {
      const res = await session.apiFetch("/api/admin/actividades/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activityId: scheduleForm.activityId,
          startsAt: new Date(scheduleForm.startsAt).toISOString(),
          capacity: scheduleForm.capacity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("saveError"));
      setNotice(t("scheduleCreated"));
      setScheduleForm((current) => ({ ...current, startsAt: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("saveError"));
    }
  };

  const toggleActivity = async (activity: Activity): Promise<void> => {
    await session.apiFetch(`/api/admin/actividades/activities/${activity.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !activity.active }),
    });
    await load();
  };

  const toggleSchedule = async (schedule: Schedule): Promise<void> => {
    await session.apiFetch(`/api/admin/actividades/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !schedule.active }),
    });
    await load();
  };

  return (
    <div className="flex flex-col gap-5">
      {notice && <p role="status" className="text-small text-olive">{notice}</p>}
      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      <section aria-labelledby="catalog-title" className="flex flex-col gap-3">
        <h2 id="catalog-title" className="font-display text-h3 font-semibold text-ink">
          {t("catalogTitle")}
        </h2>
        {loading ? (
          <p role="status" className="text-ink-soft">{t("loading")}</p>
        ) : activities.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noActivities")}</p>
        ) : (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
                <th scope="col" className="py-2">{t("code")}</th>
                <th scope="col" className="py-2">{t("name")}</th>
                <th scope="col" className="py-2">{t("price")}</th>
                <th scope="col" className="py-2">{t("state")}</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity.id} className="border-b border-line/60">
                  <th scope="row" className="py-2 text-left font-medium text-ink">{activity.code}</th>
                  <td className="py-2 text-ink">{activity.nameEs}</td>
                  <td className="py-2 text-ink-soft">{(activity.priceCents / 100).toFixed(2)} {activity.currency}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void toggleActivity(activity)}
                      className={`min-h-touch rounded-pill px-3 text-small font-semibold ${activity.active ? "bg-sea text-shell" : "border border-line text-ink-soft"}`}
                    >
                      {activity.active ? t("active") : t("paused")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={createActivity} className="flex flex-wrap items-end gap-3 rounded-brand-lg border border-line bg-shell p-4">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("code")}</span>
            <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="min-h-touch w-32 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("name")}</span>
            <input required value={form.nameEs} onChange={(event) => setForm({ ...form, nameEs: event.target.value })} className="min-h-touch w-48 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("priceCents")}</span>
            <input type="number" min={0} value={form.priceCents} onChange={(event) => setForm({ ...form, priceCents: Number(event.target.value) })} className="min-h-touch w-28 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <button type="submit" className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell">
            {t("createActivity")}
          </button>
        </form>
      </section>

      <section aria-labelledby="schedules-title" className="flex flex-col gap-3">
        <h2 id="schedules-title" className="font-display text-h3 font-semibold text-ink">
          {t("schedulesTitle")}
        </h2>
        {schedules.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noSchedules")}</p>
        ) : (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
                <th scope="col" className="py-2">{t("activity")}</th>
                <th scope="col" className="py-2">{t("startsAt")}</th>
                <th scope="col" className="py-2">{t("occupancy")}</th>
                <th scope="col" className="py-2">{t("waitlist")}</th>
                <th scope="col" className="py-2">{t("state")}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-line/60">
                  <th scope="row" className="py-2 text-left font-medium text-ink">{schedule.activityNameEs}</th>
                  <td className="py-2 text-ink-soft">{new Date(schedule.startsAt).toLocaleString()}</td>
                  <td className="py-2 text-ink-soft">{schedule.bookedSeats}/{schedule.capacity} · {t("remaining", { count: schedule.remaining })}</td>
                  <td className="py-2 text-ink-soft">{schedule.waitlistSeats}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void toggleSchedule(schedule)}
                      className={`min-h-touch rounded-pill px-3 text-small font-semibold ${schedule.active ? "bg-sea text-shell" : "border border-line text-ink-soft"}`}
                    >
                      {schedule.active ? t("active") : t("closed")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={createSchedule} className="flex flex-wrap items-end gap-3 rounded-brand-lg border border-line bg-shell p-4">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("activity")}</span>
            <select value={scheduleForm.activityId} onChange={(event) => setScheduleForm({ ...scheduleForm, activityId: event.target.value })} className="min-h-touch rounded-brand-sm border border-line bg-sand px-3">
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.nameEs}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("startsAt")}</span>
            <input type="datetime-local" required value={scheduleForm.startsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, startsAt: event.target.value })} className="min-h-touch rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("capacity")}</span>
            <input type="number" min={1} required value={scheduleForm.capacity} onChange={(event) => setScheduleForm({ ...scheduleForm, capacity: Number(event.target.value) })} className="min-h-touch w-24 rounded-brand-sm border border-line bg-sand px-3" />
          </label>
          <button type="submit" className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell">
            {t("createSchedule")}
          </button>
        </form>
      </section>
    </div>
  );
}
