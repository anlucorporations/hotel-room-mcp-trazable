import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/** Portada de Sistemas (RF-41, CU-41): acceso a Contratos, Usuarios, Finanzas y Operaciones. */
const CARDS = [
  { href: "/admin/sistemas/contratos", titleKey: "contractsTitle", descKey: "contractsTagline" },
  { href: "/admin/sistemas/usuarios", titleKey: "systemUsersTitle", descKey: "systemUsersTagline" },
  { href: "/admin/sistemas/finanzas", titleKey: "financesTitle", descKey: "financesTagline" },
  { href: "/admin/sistemas/operaciones", titleKey: "operationsTitle", descKey: "operationsTagline" },
] as const;

export default async function SistemasPage() {
  const t = await getTranslations("admin");

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h2 font-semibold text-ink">{t("systemsTitle")}</h1>
        <p className="text-ink-soft">{t("systemsTagline")}</p>
      </header>

      <ul data-testid="systems-cards" className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="flex h-full flex-col gap-2 rounded-brand-lg border border-line bg-shell px-5 py-5 shadow-card transition-colors hover:border-azure"
            >
              <h2 className="font-display text-h3 font-semibold text-ink">{t(card.titleKey)}</h2>
              <p className="text-small text-ink-soft">{t(card.descKey)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
