"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";

interface NavItem {
  readonly href: string;
  readonly labelKey: "navNights" | "navMyNights" | "navHistory" | "navAssistant";
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", labelKey: "navNights" },
  { href: "/mis-noches", labelKey: "navMyNights" },
  { href: "/historico", labelKey: "navHistory" },
  { href: "/asistente", labelKey: "navAssistant" },
];

/** Marca activa cuando la ruta coincide exactamente con el enlace (la home solo en «/»). */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Cabecera pública sticky (organismo Header, DISEÑO-UX §3/§4.1): marca con *mark* circular
 * en gradiente, navegación con `aria-current` en el activo y la barra de wallet a la derecha.
 */
export function SiteHeader() {
  const t = useTranslations("shell");
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sand/85 backdrop-blur">
      <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center gap-4 px-5 sm:gap-5">
        <Link
          href="/"
          aria-label={t("brandHome")}
          className="flex items-center gap-3 font-display text-[21px] font-semibold leading-none tracking-tight"
        >
          <span
            aria-hidden="true"
            className="h-[34px] w-[34px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]"
            style={{
              background:
                "radial-gradient(circle at 32% 30%, var(--gold), var(--terracotta) 55%, var(--sea) 130%)",
            }}
          />
          <span className="flex flex-col">
            {t("brandTitle")}
            <small className="font-sans text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-soft">
              {t("brandSubtitle")}
            </small>
          </span>
        </Link>

        <nav aria-label={t("navLabel")} className="ml-2 hidden items-center gap-6 tablet:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`py-1.5 text-small font-medium transition-colors hover:text-ink ${
                  active ? "text-ink" : "text-ink-soft"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <WalletBar />
        </div>
      </div>
    </header>
  );
}
