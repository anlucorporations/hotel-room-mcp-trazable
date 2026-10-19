import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { currentAdminSession } from "@/lib/admin-session";
import { MAINTENANCE_SUITE_ROLES } from "@/lib/mantenimiento/roles";

export const dynamic = "force-dynamic";

/**
 * Puerta y navegación de la **Suite de Mantenimiento vNext** (F4 · CU-V-01/D-C1).
 *
 * La suite pública es la única que se abre **sin** sesión; a partir de aquí todo exige una sesión
 * verificada en servidor con rol de mantenimiento (el owner entra a todas).
 *
 * Roles: `HEAD_MAINTENANCE` (jefe, con wallet para firmar) y `MAINTENANCE_TECH` (técnico, sin
 * wallet) son los vNext; `MAINTENANCE` se conserva para la suite heredada del técnico (D-77).
 *
 * La comprobación vive en el layout **y** en cada ruta de API (defensa en profundidad): un layout
 * puede ocultar el árbol, no impedir que se renderice (lección de M7 · H1).
 */
export default async function SuiteLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession([...MAINTENANCE_SUITE_ROLES]);
  if (!session.ok) return <AdminSignInScreen />;
  const t = await getTranslations("maintenance");
  const links = [
    { href: "/mantenimiento", label: t("nav.dashboard") },
    { href: "/mantenimiento/incidencias", label: t("nav.incidents") },
    { href: "/mantenimiento/preventivo", label: t("nav.preventive") },
    { href: "/mantenimiento/areas-comunes", label: t("nav.areas") },
    { href: "/mantenimiento/informes", label: t("nav.reports") },
    { href: "/mantenimiento/tablero", label: t("nav.board") },
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
