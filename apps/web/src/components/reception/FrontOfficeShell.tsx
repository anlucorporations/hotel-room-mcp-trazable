"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Shell de la Suite Front Office (F2 · D-32): barra de navegación **superior** minimalista, a
 * diferencia del sidebar de Administración. `/recepcion` es la raíz de la suite y las funciones
 * cuelgan de ella (`/recepcion/reservas`).
 */
const ITEMS = [
  { href: "/recepcion", labelKey: "navOperations" },
  { href: "/recepcion/reservas", labelKey: "navReservations" },
] as const;

export function FrontOfficeShell({ children }: { children: ReactNode }) {
  const t = useTranslations("reception");
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("navLabel")} className="flex flex-wrap gap-2 border-b border-line pb-3">
        {ITEMS.map((item) => {
          // `/recepcion` es prefijo de sus sub-rutas: la raíz solo está activa en la coincidencia exacta.
          const active = item.href === "/recepcion" ? pathname === "/recepcion" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`min-h-touch rounded-pill px-4 text-small font-medium transition-colors ${
                active ? "bg-azure text-shell" : "text-ink-soft hover:bg-mist-2 hover:text-ink"
              } flex items-center`}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
