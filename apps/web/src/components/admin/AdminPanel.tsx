"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { RoleName } from "@hotel/shared";
import { useAdminContext } from "./AdminLayout";

/**
 * Encabezado + tarjeta de un panel del back-office, con gating por rol (CU-01). Si la sesión
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
  const { hasRole, accountMismatch, signIn } = useAdminContext();
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
          className="rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink-soft"
        >
          {t("roleDenied")}
        </p>
      ) : accountMismatch ? (
        // La cuenta activa de la wallet difiere de la autenticada: bloquea las acciones para
        // no firmar con otra cuenta y exige re-autenticar (la tx revertiría on-chain igualmente).
        <div
          data-testid="account-mismatch-block"
          role="alert"
          className="flex flex-col items-start gap-3 rounded-brand-lg border border-line bg-sand-2 px-5 py-8 text-ink"
        >
          <p className="text-terracotta-text">{t("accountChanged")}</p>
          <button
            type="button"
            onClick={() => void signIn()}
            className="min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep"
          >
            {t("resign")}
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
