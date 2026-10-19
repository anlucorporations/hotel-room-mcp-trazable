import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { currentAdminSession } from "@/lib/admin-session";
import { HOUSEKEEPING_SUITE_ROLES } from "@/lib/housekeeping-suite/session";

export const dynamic = "force-dynamic";

/**
 * Puerta y navegación de la **Suite Ama de llaves** (F6 · CU-V-16).
 *
 * Roles: `HEAD_KEEPER` (ama, con wallet para la inspección opcional), `HOUSEKEEPER` (camarera, sin
 * wallet) y `HOUSEKEEPING` (suite heredada, D-77); el owner entra a todas. La comprobación se repite
 * en cada página RSC (M7 · H1).
 */
export default async function AmaDeLlavesLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession([...HOUSEKEEPING_SUITE_ROLES]);
  if (!session.ok) return <AdminSignInScreen />;
  const t = await getTranslations("amaDeLlaves");
  const links = [
    { href: "/ama-de-llaves", label: t("nav.dashboard") },
    { href: "/ama-de-llaves/turnos", label: t("nav.shifts") },
    { href: "/ama-de-llaves/asignaciones", label: t("nav.assignments") },
    { href: "/ama-de-llaves/inspecciones", label: t("nav.inspections") },
    { href: "/ama-de-llaves/danos", label: t("nav.damages") },
    { href: "/ama-de-llaves/suministros", label: t("nav.supplies") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t("nav.label")} className="flex flex-wrap gap-2 border-b border-line pb-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink transition-colors hover:bg-mist-2"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
