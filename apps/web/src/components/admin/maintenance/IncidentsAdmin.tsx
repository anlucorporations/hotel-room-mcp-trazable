"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { MAINTENANCE_STATUSES } from "@hotel/shared/domain";

interface Incident {
  id: string;
  roomNumber: number | null;
  kind: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  blocksSale: boolean;
  reportedBy: string;
  assignedTo: string | null;
  resolvedBy: string | null;
}

/**
 * Supervisión de incidencias (F4 · D-52/D-53) en Administración → Mantenimiento. Solo owner.
 *
 * Es la vista de lectura para el responsable: qué está abierto, qué bloquea venta y qué se resolvió.
 * El técnico trabaja en `/mantenimiento`.
 */
export function IncidentsAdmin() {
  const t = useTranslations("maintenance");
  const session = useAdminSession();
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await session.apiFetch(`/api/admin/mantenimiento/incidents${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || t("loadError"));
      setIncidents((data as { incidents?: Incident[] }).incidents ?? []);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [session, t, status]);

  useEffect(() => {
    if (session.sessionUsername) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionUsername, status]);

  if (session.isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loading")}
      </p>
    );
  }
  if (!session.sessionUsername || !session.hasRole("DEFAULT_ADMIN_ROLE")) {
    return (
      <p data-testid="incidents-role-denied" role="alert" className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft">
        {t("roleDeniedAdmin")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-small">
        <span className="font-medium text-ink">{t("filterStatus")}</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          data-testid="incidents-status"
          className="min-h-touch rounded-brand-sm border border-line bg-sand px-3"
        >
          <option value="">{t("filterAll")}</option>
          {MAINTENANCE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`status.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-brand-lg border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-small text-ink">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-ink-soft">
          {t("loading")}
        </p>
      ) : incidents.length === 0 ? (
        <p className="text-small text-ink-soft">{t("noIncidents")}</p>
      ) : (
        <table className="w-full border-collapse text-small">
          <thead>
            <tr className="border-b border-line text-left text-micro uppercase tracking-wide text-ink-soft">
              <th scope="col" className="py-2">{t("room")}</th>
              <th scope="col" className="py-2">{t("reportKind")}</th>
              <th scope="col" className="py-2">{t("reportPriority")}</th>
              <th scope="col" className="py-2">{t("reportStatus")}</th>
              <th scope="col" className="py-2">{t("blocksSale")}</th>
              <th scope="col" className="py-2">{t("assignedColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id} className="border-b border-line/60">
                <th scope="row" className="py-2 text-left font-medium text-ink">{incident.roomNumber ?? "—"}</th>
                <td className="py-2 text-ink">{t(`kind.${incident.kind}` as "kind.OTROS")}</td>
                <td className="py-2 text-ink-soft">{t(`priority.${incident.priority}`)}</td>
                <td className="py-2 text-ink-soft">{t(`status.${incident.status}`)}</td>
                <td className="py-2 text-ink-soft">{incident.blocksSale ? t("yes") : t("no")}</td>
                <td className="py-2 text-ink-soft">{incident.assignedTo ?? incident.resolvedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
