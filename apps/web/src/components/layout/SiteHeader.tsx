"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { WalletMenu } from "@/components/wallet/WalletMenu";
import { AssistantHeaderTrigger } from "@/components/assistant/AssistantDock";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { isActiveRoute } from "./navigation";

type ShellLabelKey =
  // D-76: la suite pública es el home del proyecto; su primera entrada es «Inicio».
  | "navHome"
  | "navCatalog"
  | "navAuctions"
  | "navReserve"
  | "navResale"
  | "navMyNights"
  | "navHistory"
  | "navAssistant"
  | "navHelp"
  | "navCompany"
  | "navFacilities"
  | "navServices"
  | "navRooms"
  | "navExperiences"
  | "navActivities"
  | "navPlans"
  | "navReviews"
  | "navContact"
  | "navHotelGroup"
  | "navDiscoverGroup";

interface NavItem {
  readonly href: string;
  readonly labelKey: ShellLabelKey;
}

/**
 * Navegación de la suite pública (petición del responsable, 2026-09-28).
 *
 * La barra se **nutre de las páginas de detalle**: cada sección de la home tiene su página y su
 * entrada de menú. Se reparte en tres grupos para que la cabecera no se sature: los **primarios**
 * (los que llevan a la decisión de compra) y dos desplegables accesibles —`<details>` nativo, sin
 * JavaScript— con «El hotel» y «Descubre».
 */
const PRIMARY_ITEMS: readonly NavItem[] = [
  // D-76: la suite pública es el home del proyecto; su primera entrada es «Inicio» (`/`).
  { href: "/", labelKey: "navHome" },
  { href: "/habitaciones", labelKey: "navRooms" },
  { href: "/catalogo", labelKey: "navCatalog" },
  // C2 (RF-13): subasta primaria de noches premium, junto a la compra directa.
  { href: "/subastas", labelKey: "navAuctions" },
  // D-65/D-72: reserva con wallet (retención + anticipo por transferencia).
  { href: "/reservar", labelKey: "navReserve" },
];

const NAV_GROUPS: readonly { labelKey: ShellLabelKey; items: readonly NavItem[] }[] = [
  {
    labelKey: "navHotelGroup",
    items: [
      { href: "/empresa", labelKey: "navCompany" },
      { href: "/instalaciones", labelKey: "navFacilities" },
      { href: "/servicios", labelKey: "navServices" },
      { href: "/planes", labelKey: "navPlans" },
      { href: "/resenas", labelKey: "navReviews" },
      { href: "/contacto", labelKey: "navContact" },
    ],
  },
  {
    labelKey: "navDiscoverGroup",
    items: [
      { href: "/experiencias", labelKey: "navExperiences" },
      { href: "/actividades", labelKey: "navActivities" },
      { href: "/reventa", labelKey: "navResale" },
      { href: "/mis-noches", labelKey: "navMyNights" },
      { href: "/historico", labelKey: "navHistory" },
      { href: "/asistente", labelKey: "navAssistant" },
      { href: "/ayuda", labelKey: "navHelp" },
    ],
  },
];

/**
 * Cabecera pública sticky (organismo Header, docs/SRS.md §7): marca con *mark* circular
 * en gradiente, navegación con `aria-current` en el activo y la barra de wallet a la derecha.
 *
 * En tablet+ la navegación es horizontal; en móvil se sustituye por un botón hamburguesa
 * accesible que despliega todos los enlaces públicos, agrupados (MAJOR#10/UX#4).
 */
export function SiteHeader() {
  const t = useTranslations("shell");
  const pathname = usePathname();
  // D-77: la cabecera pública conoce la sesión para que el menú de Usuario ofrezca los accesos a
  // las suites que corresponden al tipo de usuario. Es solo vista: cada suite revalida en servidor.
  const session = useAdminSession();
  // Distribución editorial (2026-10-23): en la home la cabecera se superpone al hero y se vuelve
  // sólida al hacer scroll. En el resto de páginas es sticky y sólida desde el primer píxel.
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);
  const overlay = isHome && !scrolled;
  const headerClass = isHome
    ? "fixed"
    : "sticky top-0";
  const toneClass = overlay
    ? "site-header--overlay border-line text-ink backdrop-blur tablet:border-transparent tablet:text-shell"
    : "border-line bg-shell/95 text-ink backdrop-blur";
  const brandTone = overlay ? "text-ink tablet:text-shell" : "text-ink";
  const subTone = overlay ? "text-ink-soft tablet:text-shell/75" : "text-ink-soft";
  const navTone = overlay
    ? "text-shell/85 hover:text-shell"
    : "text-ink-soft hover:text-ink";
  const navActive = overlay ? "text-shell" : "text-ink";

  return (
    <header className={`${headerClass} top-0 z-40 border-b transition-colors duration-300 ${toneClass}`}>
      <div className="mx-auto flex h-[76px] w-full max-w-7xl items-center gap-4 px-5 tablet:px-8">
        <Link
          href="/"
          aria-label={t("brandHome")}
          className={`flex items-center gap-2.5 font-display text-[18px] font-semibold leading-none tracking-tight tablet:gap-3 tablet:text-[22px] ${brandTone}`}
        >
          <span
            aria-hidden="true"
            className="h-[30px] w-[30px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)] tablet:h-[34px] tablet:w-[34px]"
            style={{
              background:
                "radial-gradient(circle at 32% 30%, var(--amber), var(--coral) 55%, var(--azure) 130%)",
            }}
          />
          <span className="flex flex-col">
            {t("brandTitle")}
            <small className={`font-sans text-[10px] font-medium uppercase tracking-[0.2em] ${subTone}`}>
              {t("brandSubtitle")}
            </small>
          </span>
        </Link>

        <nav aria-label={t("navLabel")} className="mx-auto hidden items-center gap-4 tablet:flex desktop:gap-6">
          {PRIMARY_ITEMS.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`py-1.5 text-small font-medium transition-colors ${navTone} ${
                  active ? navActive : ""
                }`}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}

          {NAV_GROUPS.map((group) => {
            const groupActive = group.items.some((item) => isActiveRoute(pathname, item.href));
            return (
              <details key={group.labelKey} className="group relative">
                <summary
                  className={`flex cursor-pointer list-none items-center gap-1 py-1.5 text-small font-medium transition-colors ${navTone} ${
                    groupActive ? navActive : ""
                  }`}
                >
                  {t(group.labelKey)}
                  <span aria-hidden="true" className="text-micro transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <ul className="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-brand border border-line bg-shell p-2 shadow-modal">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
                        className="flex min-h-touch items-center rounded-brand-sm px-3 text-small text-ink-soft transition-colors hover:bg-mist-2 hover:text-ink"
                      >
                        {t(item.labelKey)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 tablet:gap-2">
          {/* En móvil la cabecera se queda en logo + menú: el asistente y la wallet viven dentro
              del panel para no robar ancho ni romper el wordmark a 320–390 px. */}
          <div className="hidden tablet:block"><AssistantHeaderTrigger /></div>
          <div className="hidden tablet:block"><WalletMenu session={session} /></div>
          <MobileNav pathname={pathname} session={session} />
        </div>
      </div>
    </header>
  );
}

/**
 * Navegación móvil accesible (MAJOR#10/UX#4), visible solo `<tablet`.
 *
 * Botón hamburguesa con `aria-expanded`/`aria-controls` y área táctil ≥44px que despliega
 * los mismos enlaces que la barra de escritorio. El panel cierra con Escape, al elegir un enlace y al cambiar de ruta;
 * el foco se mueve al primer enlace al abrir y vuelve al botón al cerrar.
 */
function MobileNav({ pathname, session }: { pathname: string; session: ReturnType<typeof useAdminSession> }) {
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
        className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-brand-sm text-ink transition-colors hover:bg-mist-2"
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
            className="fixed inset-0 top-[76px] z-30 cursor-default bg-ink/30"
          />
          <nav
            id={panelId}
            aria-label={t("navLabel")}
            className="absolute left-0 right-0 top-[76px] z-40 max-h-[calc(100dvh-76px)] overflow-y-auto border-b border-line bg-shell px-5 py-4 shadow-modal "
          >
            {[{ labelKey: null, items: PRIMARY_ITEMS }, ...NAV_GROUPS].map((group, groupIndex) => (
              <div key={group.labelKey ?? "primary"} className={groupIndex === 0 ? "" : "mt-3 border-t border-line pt-3"}>
                {group.labelKey && (
                  <p className="px-1 pb-1 text-micro font-semibold uppercase tracking-[0.14em] text-ink-soft">
                    {t(group.labelKey)}
                  </p>
                )}
                <ul className="flex flex-col">
                  {group.items.map((item, index) => {
                    const active = isActiveRoute(pathname, item.href);
                    const isFirstLink = groupIndex === 0 && index === 0;
                    return (
                      <li key={item.href}>
                        <Link
                          ref={isFirstLink ? firstLinkRef : undefined}
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
              </div>
            ))}
            <div className="mt-4 border-t border-line pt-4">
              <WalletMenu session={session} />
            </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}
