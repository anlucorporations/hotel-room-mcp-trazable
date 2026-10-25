import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "./providers";
import "./fonts.css";
import "./globals.css";
import "./admin-surface.css";

/**
 * Tipografías por superficie (2026-10-23):
 *   · Suite pública «Cal & Sal»: Cormorant Garamond (display) + Onest (UI).
 *   · Suite administrativa «Posidonia»: Spectral (display) + Inter Tight (UI), activadas en el
 *     scope `.admin-surface` (ver `app/admin-surface.css`).
 * Los woff2 se **autohospedan** en `public/fonts/` y se declaran en `fonts.css` (latin + cyrillic),
 * de modo que build y runtime no dependen de `fonts.gstatic.com`. El guardián
 * `cyrillic-fonts.test.ts` exige las cuatro familias con ambos subconjuntos y las pilas correctas.
 */


// Metadata i18n (MINOR#41): título y descripción desde las claves `app.*`.
// La imagen social la genera `app/opengraph-image.tsx` con los tokens de marca (Fase D).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const title = t("name");
  const description = t("description");

  return {
    title,
    description,
    // Base para resolver las URLs absolutas que exigen Open Graph y Twitter. En producción se
    // define `NEXT_PUBLIC_SITE_URL`; en desarrollo se usa el local para no inventar un dominio.
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    openGraph: {
      type: "website",
      siteName: title,
      title,
      description,
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-azure-deep focus:text-shell focus:rounded-brand-sm focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-azure"
        >
          Saltar al contenido principal
        </a>
        <NextIntlClientProvider messages={messages}>
          <Providers><main id="main-content">{children}</main></Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
