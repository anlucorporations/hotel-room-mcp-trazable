"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { WalletMenu } from "@/components/wallet/WalletMenu";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { isActiveRoute } from "./navigation";

interface NavItem {
  readonly href: string;
  readonly labelKey:
    | "navHome"
    | "navResale"
    | "navMyNights"
    | "navHistory"
    | "navAssistant"
    | "navHelp";
}

const NAV_ITEMS: readonly NavItem[] = [
  // D-76: la suite pública es el home del proyecto; su primera entrada es «Inicio» (`/`).
  { href: "/", labelKey: "navHome" },
  // D-07: el mercado secundario es una vista propia; el catálogo solo ofrece primaria.
  { href: "/reventa", labelKey: "navResale" },
  { href: "/mis-noches", labelKey: "navMyNights" },
  { href: "/historico", labelKey: "navHistory" },
  { href: "/asistente", labelKey: "navAssistant" },
  // M9 (D-14/D-17): la ayuda sirve los manuales del repositorio desde la propia web.
  { href: "/ayuda", labelKey: "navHelp" },
];

/**
 * Cabecera pública sticky (organismo Header, docs/SRS.md §7): marca con *mark* circular
 * en gradiente, navegación con `aria-current` en el activo y la barra de wallet a la derecha.
 *
 * En tablet+ la navegación es horizontal; en móvil se sustituye por un botón hamburguesa
 * accesible que despliega los mismos `NAV_ITEMS` (MAJOR#10/UX#4).
 */
export function SiteHeader() {
  const t = useTranslations("shell");
  const pathname = usePathname();
  // D-77: la cabecera pública conoce la sesión para que el menú de Usuario ofrezca los accesos a
  // las suites que corresponden al tipo de usuario. Es solo vista: cada suite revalida en servidor.
  const session = useAdminSession();

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
            const active = isActiveRoute(pathname, item.href);
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

        <div className="ml-auto flex items-center gap-2">
          <WalletMenu session={session} />
          <MobileNav pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

/**
 * Navegación móvil accesible (MAJOR#10/UX#4), visible solo `<tablet`.
 *
 * Botón hamburguesa con `aria-expanded`/`aria-controls` y área táctil ≥44px que despliega
 * los `NAV_ITEMS`. El panel cierra con Escape, al elegir un enlace y al cambiar de ruta;
 * el foco se mueve al primer enlace al abrir y vuelve al botón al cerrar.
 */
function MobileNav({ pathname }: { pathname: string }) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Cierra el panel cuando la navegación cambia de ruta (evita panel abierto «fantasma»).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Cierre con Escape y foco al primer enlace al abrir; devuelve el foco al botón al cerrar.
  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="tablet:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("menuClose") : t("menuOpen")}
        className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-brand-sm text-ink transition-colors hover:bg-sand-2"
      >
        <span aria-hidden="true" className="relative block h-4 w-5">
          <span
            className={`absolute left-0 block h-0.5 w-5 rounded bg-current transition-transform ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 block h-0.5 w-5 rounded bg-current transition-opacity ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 block h-0.5 w-5 rounded bg-current transition-transform ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-[68px] z-30 cursor-default bg-ink/20"
          />
          <nav
            id={panelId}
            aria-label={t("navLabel")}
            className="absolute left-0 right-0 top-[68px] z-40 border-b border-line bg-sand px-5 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
          >
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item, index) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      ref={index === 0 ? firstLinkRef : undefined}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-touch items-center text-body font-medium transition-colors ${
                        active ? "text-ink" : "text-ink-soft hover:text-ink"
                      }`}
                    >
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      ) : null}
    </div>
  );
}
