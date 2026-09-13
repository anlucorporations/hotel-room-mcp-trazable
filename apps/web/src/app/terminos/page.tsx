import { getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/layout/PublicShell";

export const metadata = { title: "Términos" };

const SECTIONS = [
  "pilot",
  "ownership",
  "transfer",
  "micaNonCustody",
  "travelerRegistry",
  "noWarranty",
] as const;

/**
 * Página de Términos (UX#6/MINOR#40): contenido placeholder honesto para que el enlace
 * del pie tenga un destino real. Declara explícitamente que es un piloto sobre red privada.
 */
export default async function TerminosPage() {
  const t = await getTranslations("legal.terms");

  return (
    <PublicShell>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
        <header>
          <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-body text-ink-soft">{t("intro")}</p>
        </header>
        {SECTIONS.map((section) => (
          <section key={section} className="flex flex-col gap-1.5">
            <h2 className="font-display text-h3 font-medium">{t(`sections.${section}.heading`)}</h2>
            <p className="text-body text-ink-soft">{t(`sections.${section}.body`)}</p>
          </section>
        ))}
        <p className="text-small text-ink-soft">{t("placeholderNote")}</p>
      </article>
    </PublicShell>
  );
}
