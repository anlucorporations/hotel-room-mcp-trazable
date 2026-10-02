import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";
import { PageHeader, PageSection } from "@/components/public/PageHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("contact.title"), description: t("contact.subtitle") };
}

const MAP_EMBED =
  "https://www.openstreetmap.org/export/embed.html?bbox=-0.4920%2C38.3345%2C-0.4700%2C38.3560&layer=mapnik&marker=38.3452%2C-0.4810";

/**
 * Página **Contacto** de la suite pública (2026-09-28 · 1.1).
 *
 * Dirección, teléfono y correo reales del proyecto (`home.contact.*`, una sola fuente con la home),
 * mapa de OpenStreetMap (D-67, sin clave ni seguimiento) y dos avisos honestos: cómo llegar y que el
 * registro de viajeros se sigue haciendo en el mostrador (D-13).
 */
export default async function ContactPage() {
  const home = await getTranslations("home");
  // El aviso del registro de viajeros (D-13) vive en el namespace `contact`, no en `home`: pedirlo
  // a `home` devolvía el literal `home.travelers.title` en pantalla (defecto detectado por el
  // escaneo axe del 2026-10 y ahora cubierto por `src/lib/i18n-keys.test.ts`).
  const contact = await getTranslations("contact");
  const shell = await getTranslations("shell");

  return (
    <PublicShell>
      <PageHeader eyebrow={shell("navContact")} title={home("contact.title")} lead={home("contact.subtitle")} />

      <PageSection id="contact-details" title={home("contact.title")}>
        <div className="grid gap-6 tablet:grid-cols-2">
          <div>
            <address className="flex flex-col gap-2 text-body not-italic text-ink">
              <span>{home("contact.address")}</span>
              <a className="text-azure-deep underline" href={`tel:${home("contact.phoneHref")}`}>
                {home("contact.phone")}
              </a>
              <a className="text-azure-deep underline" href={`mailto:${home("contact.email")}`}>
                {home("contact.email")}
              </a>
            </address>
            <h3 className="mt-6 font-display text-body font-semibold text-ink">
              {contact("howToArrive.title")}
            </h3>
            <p className="mt-1.5 max-w-prose text-small text-ink-soft">{contact("howToArrive.body")}</p>
          </div>
          <div className="overflow-hidden rounded-brand border border-line">
            <iframe
              title={home("contact.mapTitle")}
              src={MAP_EMBED}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full"
            />
          </div>
        </div>
      </PageSection>

      <PageSection id="contact-travelers" title={contact("travelers.title")} tone="band">
        <p className="max-w-prose text-body text-ink-soft">{contact("travelers.body")}</p>
      </PageSection>
    </PublicShell>
  );
}
