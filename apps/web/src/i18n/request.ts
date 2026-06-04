import { getRequestConfig } from "next-intl/server";

/**
 * Configuración i18n (next-intl, ADR-14). El piloto es solo español, pero la arquitectura
 * queda lista para añadir locales (RNF-06): los textos viven en `messages/<locale>.json`.
 */
const DEFAULT_LOCALE = "es" as const;

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
