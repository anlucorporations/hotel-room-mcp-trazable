"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { IncidentDto } from "@/lib/mantenimiento/types";

const BUTTON =
  "min-h-touch rounded-pill border border-line px-3 text-micro font-semibold text-ink transition-colors hover:bg-mist-2 disabled:opacity-60";

/**
 * Listado de incidencias de la Suite de Mantenimiento (F4 · T4.2).
 *
 * `data-testid="incident-list"` es el oráculo, y cada fila enlaza a su ficha
 * (`/mantenimiento/incidencias/[id]`). Las acciones rápidas (asignar/resolver/cancelar) van por la
 * API existente; la ficha es donde vive el bloqueo/desbloqueo firmado.
 */
export function IncidentList({
  incidents,
  canManage,
}: {
  readonly incidents: readonly IncidentDto[];
  readonly canManage: boolean;
}) {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "assign" | "resolve" | "cancel"): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/mantenimiento/incidents/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(data?.message ?? `HTTP ${response.status}`);
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("actionError"));
    } finally {
      setBusyId(null);
    }
  }

  if (incidents.length === 0) {
    return (
      <p data-testid="empty-state" className="rounded-brand border border-dashed border-line px-4 py-6 text-small text-ink-soft">
        {t("noIncidents")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="incident-list">
      {error !== null && (
        <p role="alert" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-brand border border-line">
        {incidents.map((incident) => {
          const open = incident.status === "OPEN" || incident.status === "IN_PROGRESS";
          return (
            <li key={incident.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/mantenimiento/incidencias/${incident.id}`}
                  className="font-semibold text-ink underline-offset-2 hover:underline"
                  data-testid="incident-detail-link"
                >
                  {t("room")} {incident.roomNumber ?? "—"} · {t(`kind.${incident.kind}`)}
                </Link>
                <p className="text-micro text-ink-soft">
                  {t(`status.${incident.status}`)} · {t(`priority.${incident.priority}`)}
                  {incident.assignedTo ? ` · ${t("assignedTo", { name: incident.assignedTo })}` : ""}
                  {incident.blocksSale ? ` · ${t("blocksSale")}` : ""}
                </p>
              </div>
              {canManage && open && (
                <div className="flex flex-wrap gap-2">
                  {!incident.assignedTo && (
                    <button type="button" className={BUTTON} disabled={busyId === incident.id} onClick={() => act(incident.id, "assign")}>
                      {t("assignMe")}
                    </button>
                  )}
                  <button type="button" className={BUTTON} disabled={busyId === incident.id} onClick={() => act(incident.id, "resolve")}>
                    {t("resolve")}
                  </button>
                  <button type="button" className={BUTTON} disabled={busyId === incident.id} onClick={() => act(incident.id, "cancel")}>
                    {t("cancel")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
