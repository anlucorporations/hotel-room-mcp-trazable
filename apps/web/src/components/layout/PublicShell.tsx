import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/**
 * Plantilla pública (PublicLayout, DISEÑO-UX §3): skip-link de accesibilidad +
 * cabecera + `<main id="contenido">` + pie. Envuelve todas las vistas públicas.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-br-brand-sm bg-sea px-4 py-3 font-semibold text-shell focus:not-sr-only focus:absolute focus:left-0 focus:top-0"
      >
        {t("skipToCatalog")}
      </a>
      <SiteHeader />
      <main id="contenido" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
