"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { PREVENTIVE_PERIODICITIES } from "@hotel/shared/domain";

interface Plan {
  id: string;
  code: string;
  name: string;
  equipment: string;
  roomNumber: number | null;
  periodicity: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  active: boolean;
}
interface Task {
  id: string;
  planCode: string | null;
  planName: string | null;
  equipment: string | null;
  dueDate: string;
  overdue: boolean;
}

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Mantenimiento preventivo (F4 · D-54) en Administración → Mantenimiento. Solo owner.
 *
 * Da de alta planes con su periodicidad y muestra las tareas **vencidas o de hoy** (el aviso que el
 * técnico ve en `/mantenimiento` y que el worker envía por correo). La ejecución y el cierre de las
 * tareas es del técnico; aquí se programa.
 */
export function PreventiveAdmin() {
  const t = useTranslations("maintenance");
  const session = useAdminSession();
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [dueTasks, setDueTasks] = useState<readonly Task[]>([]);
  const [form, setForm] = useState({ code: "", name: "", equipment: "", periodicity: "MONTHLY", firstDueDate: todayIso() });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, tasksRes] = await Promise.all([
        session.apiFetch("/api/admin/mantenimiento/plans").then((res) => res.json().catch(() => ({}))),
        session.apiFetch(`/api/mantenimiento/tasks?due=${todayIso()}`).then((res) => res.json().catch(() => ({}))),
      ]);
      setPlans((plansRes as { plans?: Plan[] }).plans ?? []);
      setDueTasks((tasksRes as { tasks?: Task[] }).tasks ?? []);
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
      <p data-testid="preventive-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDeniedAdmin")}
      </p>
    );
  }

  const createPlan = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await session.apiFetch("/api/admin/mantenimiento/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("planError"));
      setNotice(t("planCreated", { code: form.code.toUpperCase() }));
      setForm({ code: "", name: "", equipment: "", periodicity: "MONTHLY", firstDueDate: todayIso() });
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("planError"));
    }
  };

  const toggle = async (plan: Plan): Promise<void> => {
    setError(null);
    try {
      const res = await session.apiFetch(`/api/admin/mantenimiento/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !plan.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || t("planError"));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("planError"));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {dueTasks.length > 0 && (
        <div role="alert" data-testid="preventive-due" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3">
          <h2 className="text-small font-semibold text-ink">{t("dueWarning", { count: dueTasks.length })}</h2>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-soft">
            {dueTasks.map((task) => (
              <li key={task.id}>
                {task.planName ?? task.planCode}: {task.dueDate}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <p role="status" className="text-small text-olive">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      <section aria-labelledby="plans-title" className="flex flex-col gap-3">
        <h2 id="plans-title" className="font-display text-h3 font-semibold text-ink">
          {t("plansTitle")}
        </h2>
        {loading ? (
          <p role="status" className="text-ink-soft">{t("loading")}</p>
        ) : plans.length === 0 ? (
          <p className="text-small text-ink-soft">{t("noPlans")}</p>
        ) : (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
                <th scope="col" className="py-2">{t("planCode")}</th>
                <th scope="col" className="py-2">{t("planName")}</th>
                <th scope="col" className="py-2">{t("planEquipment")}</th>
                <th scope="col" className="py-2">{t("planPeriodicity")}</th>
                <th scope="col" className="py-2">{t("planActive")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-line/60">
                  <th scope="row" className="py-2 text-left font-medium text-ink">{plan.code}</th>
                  <td className="py-2 text-ink">{plan.name}</td>
                  <td className="py-2 text-ink-soft">{plan.equipment}{plan.roomNumber ? ` · ${plan.roomNumber}` : ""}</td>
                  <td className="py-2 text-ink-soft">{t(`periodicity.${plan.periodicity}`)}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void toggle(plan)}
                      className={`min-h-touch rounded-pill px-3 text-small font-semibold ${plan.active ? "bg-sea text-shell" : "border border-line text-ink-soft"}`}
                    >
                      {plan.active ? t("active") : t("paused")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="new-plan-title" className="rounded-brand-lg border border-line bg-shell p-4">
        <h2 id="new-plan-title" className="font-display text-h3 font-semibold text-ink">
          {t("newPlanTitle")}
        </h2>
        <form onSubmit={createPlan} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("planCode")}</span>
            <input
              type="text"
              required
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              className="min-h-touch w-32 rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("planName")}</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="min-h-touch w-48 rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("planEquipment")}</span>
            <input
              type="text"
              required
              value={form.equipment}
              onChange={(event) => setForm({ ...form, equipment: event.target.value })}
              className="min-h-touch w-48 rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("planPeriodicity")}</span>
            <select
              value={form.periodicity}
              onChange={(event) => setForm({ ...form, periodicity: event.target.value })}
              className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
            >
              {PREVENTIVE_PERIODICITIES.map((option) => (
                <option key={option} value={option}>{t(`periodicity.${option}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small">
            <span className="font-medium text-ink">{t("firstDueDate")}</span>
            <input
              type="date"
              required
              value={form.firstDueDate}
              onChange={(event) => setForm({ ...form, firstDueDate: event.target.value })}
              className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
            />
          </label>
          <button type="submit" className="min-h-touch rounded-pill bg-sea px-4 text-small font-semibold text-shell">
            {t("createPlan")}
          </button>
        </form>
      </section>
    </div>
  );
}
