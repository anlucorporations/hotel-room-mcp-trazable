import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope, Playfair_Display } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Tipografías de marca «Brisa Marina» (Manual_Identidad_Visual.md v2.0.0): serif elegante
 * (display) + geométrica fresca (UI). Las DOS familias publican el subconjunto `cyrillic` en
 * Google Fonts, así que el locale RU queda cubierto por las propias fuentes de marca: ya no hace
 * falta la cascada glifo a glifo con respaldos sin precarga del sistema anterior. El guardián
 * `cyrillic-fonts.test.ts` exige que ambas declaren el subconjunto cirílico.
 */
const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-playfair",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

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
    <html
      lang={locale}
      className={`${playfair.variable} ${manrope.variable}`}
    >
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
