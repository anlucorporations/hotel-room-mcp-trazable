import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";
import "./globals.css";

// Tipografías de marca (DISEÑO-UX §2.2): serif editorial (display) + grotesca (UI).
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

export const metadata: Metadata = {
  title: "Hotel Marina del Sol",
  description: "Noches de hotel como NFTs (piloto sobre red Besu privada).",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${fraunces.variable} ${hanken.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
