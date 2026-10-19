"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MaintenanceReportDto } from "@/lib/mantenimiento/types";

const FIELD =
  "min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";

function Rows({ title, data }: { readonly title: string; readonly data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-brand border border-line px-4 py-3">
      <h3 className="text-h4 font-semibold text-ink">{title}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-small text-ink-soft">
        {entries.map(([key, count]) => (
          <li key={key} className="flex justify-between gap-4">
            <span>{key}</span>
            <span className="font-semibold text-ink">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * **Informes** de la suite (F4 · T4.2/T4.4): incidencias por estado/tipo/técnico, preventivo por
 * estado y ejecuciones de áreas comunes, con filtro de periodo. Se calcula en servidor y se pinta
 * aquí; el estado vacío es explícito (`empty-state`).
 */
export function MaintenanceReports() {
  const t = useTranslations("maintenance");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<MaintenanceReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/mantenimiento/informes?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as (MaintenanceReportDto & { message?: string }) | null;
      if (!response.ok || data === null) throw new Error(data?.message ?? `HTTP ${response.status}`);
      setReport(data);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-small text-ink-soft">{t("loading")}</p>;
  if (error !== null) return <p className="text-small text-error">{error}</p>;
  if (report === null) return <p data-testid="empty-state" className="text-small text-ink-soft">{t("reportsEmpty")}</p>;

  const empty =
    report.incidents.total === 0 && report.preventive.total === 0 && report.areas.logged === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="maintenance-reports">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("reportsFrom")}
          <input type="date" className={FIELD} value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-small text-ink">
          {t("reportsTo")}
          <input type="date" className={FIELD} value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      {empty ? (
        <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
          {t("reportsEmpty")}
        </p>
      ) : (
        <>
          <div className="grid gap-3 tablet:grid-cols-3">
            <div className="rounded-brand border border-line px-4 py-3">
              <p className="text-micro uppercase tracking-wider text-ink-soft">{t("reportsIncidents")}</p>
              <p className="text-h2 font-semibold text-ink">{report.incidents.total}</p>
              <p className="text-micro text-ink-soft">{t("blocksSaleCount", { count: report.incidents.blockingOpen })}</p>
            </div>
            <div className="rounded-brand border border-line px-4 py-3">
              <p className="text-micro uppercase tracking-wider text-ink-soft">{t("reportsPreventive")}</p>
              <p className="text-h2 font-semibold text-ink">{report.preventive.total}</p>
              <p className="text-micro text-ink-soft">{t("criticalPendingCount", { count: report.preventive.criticalPending })}</p>
            </div>
            <div className="rounded-brand border border-line px-4 py-3">
              <p className="text-micro uppercase tracking-wider text-ink-soft">{t("reportsAreas")}</p>
              <p className="text-h2 font-semibold text-ink">{report.areas.logged}</p>
              <p className="text-micro text-ink-soft">
                {t("pendingVerificationCount", { count: report.areas.pendingVerification })}
              </p>
            </div>
          </div>
          <div className="grid gap-3 tablet:grid-cols-2">
            <Rows title={t("reportsByStatus")} data={report.incidents.byStatus} />
            <Rows title={t("reportsByKind")} data={report.incidents.byKind} />
            <Rows title={t("reportsByTechnician")} data={report.incidents.byTechnician} />
            <Rows title={t("reportsAreasByArea")} data={report.areas.byArea} />
          </div>
        </>
      )}
    </div>
  );
}
