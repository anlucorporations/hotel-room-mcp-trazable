import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Hanken_Grotesk, Inter, Playfair_Display } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "./providers";
import "./globals.css";

// Tipografías de marca (docs/SRS.md §7): serif editorial (display) + grotesca (UI).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/**
 * Respaldo **cirílico** (propuesta de imagen visual §3.4, decisión aprobada el 2026-09-27).
 *
 * Fraunces no publica el subconjunto `cyrillic` y Hanken Grotesk solo el *extendido*, así que hoy el
 * locale RU caía a `Georgia`/`system-ui` (el producto declara paridad ES/EN/RU). La cascada es
 * **glifo a glifo**: ES/EN siguen viendo las fuentes de marca y el ruso toma estas dos, cargadas
 * **solo** en el subconjunto cirílico y con `preload: false` para no penalizar el LCP de ES/EN.
 */
const playfairCyrillic = Playfair_Display({
  subsets: ["cyrillic"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});
const interCyrillic = Inter({
  subsets: ["cyrillic"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// Metadata i18n (MINOR#41): título y descripción desde las claves `app.*`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("name"),
    description: t("description"),
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
      className={`${fraunces.variable} ${hanken.variable} ${playfairCyrillic.variable} ${interCyrillic.variable}`}
    >
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-sea-deep focus:text-shell focus:rounded-brand-sm focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sea"
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
