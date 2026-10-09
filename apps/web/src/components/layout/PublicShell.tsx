import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AssistantDock, AssistantUiProvider } from "@/components/assistant/AssistantDock";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SkipLink } from "./SkipLink";

/**
 * Plantilla pública (PublicLayout, docs/SRS.md §7): skip-link de accesibilidad +
 * cabecera + `<main id="contenido">` + pie. Envuelve todas las vistas públicas.
 *
 * **Incremento v4**: la plantilla —que también usan las suites de recepción— monta el asistente
 * global (`AssistantUiProvider` + `AssistantDock`). Al vivir en la plantilla, el asistente está en
 * toda la plataforma sin tocar página por página.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");

  return (
    <AssistantUiProvider>
      <div className="flex min-h-screen flex-col">
        <SkipLink target="#contenido" label={t("skipToContent")} />
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
        <AssistantDock />
      </div>
    </AssistantUiProvider>
  );
}
