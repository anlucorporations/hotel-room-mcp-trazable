import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const SUPPORTED_LOCALES = ["es", "en", "ru"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "es";

export default getRequestConfig(async () => {
  let resolvedLocale: SupportedLocale = DEFAULT_LOCALE;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value as SupportedLocale | undefined;

    if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
      resolvedLocale = cookieLocale;
    } else {
      const headerStore = await headers();
      const acceptLang = headerStore.get("accept-language")?.toLowerCase() || "";
      if (acceptLang.startsWith("ru")) {
        resolvedLocale = "ru";
      } else if (acceptLang.startsWith("en")) {
        resolvedLocale = "en";
      }
    }
  } catch {
    resolvedLocale = DEFAULT_LOCALE;
  }

  const messages = (await import(`../../messages/${resolvedLocale}.json`)).default;
  return { locale: resolvedLocale, messages };
});

