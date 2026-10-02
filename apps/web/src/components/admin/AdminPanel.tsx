"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { RoleName } from "@hotel/shared/domain";
import { useAdminContext } from "./AdminLayout";

/**
 * Encabezado + tarjeta de un panel del back-office, con gating por rol (CU-01, docs/SRS.md §9). Si la sesión
 * no ostenta `requiredRole`, muestra un aviso accesible en lugar de la acción (UX); la
 * autoridad real sigue siendo el contrato. `requiredRole` ausente = cualquier sesión válida.
 */
export function AdminPanel({
  titleKey,
  descriptionKey,
  requiredRole,
  children,
}: {
  titleKey: string;
  descriptionKey?: string;
  requiredRole?: RoleName;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const { hasRole, sessionUsername, signOut } = useAdminContext();
  const allowed = !requiredRole || hasRole(requiredRole);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold text-ink">{t(titleKey)}</h1>
        {descriptionKey && <p className="text-ink-soft">{t(descriptionKey)}</p>}
      </header>
      {!allowed ? (
        <p
          data-testid="role-denied"
          role="alert"
          className="rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink-soft"
        >
          {t("roleDenied")}
        </p>
      ) : !sessionUsername ? (
        // La sesión ya no es válida (token caducado o revocado): se pide volver a entrar en lugar
        // de dejar el panel con acciones que fallarían con 401 (D-04).
        <div
          data-testid="session-expired-block"
          role="alert"
          className="flex flex-col items-start gap-3 rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink"
        >
          <p className="text-coral-text">{t("authExpired")}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep"
          >
            {t("logout")}
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Tarjeta de marca reutilizable dentro de un panel (borde + sombra + fondo claro). */
export function AdminCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-brand-lg border border-line bg-shell p-5 shadow-card">{children}</div>
  );
}
