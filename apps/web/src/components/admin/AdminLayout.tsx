"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BREAKPOINT_TABLET_PX, type RoleName } from "@hotel/shared/domain";
import { WalletMenu } from "@/components/wallet/WalletMenu";
import { ADMIN_ICONS, ChevronIcon, CollapseIcon, HelpIcon, MenuIcon, UserIcon } from "./adminIcons";
import {
  ADMIN_NAV_SECTIONS,
  breadcrumbForPathname,
  isActiveHref,
  sectionForPathname,
  type AdminNavGroup,
  type AdminNavItem,
  type AdminNavLabelKey,
  type AdminSectionKey,
} from "./adminNav";
import { CredentialForm } from "./CredentialForm";
import { useAdminSession, type AdminSession } from "./useAdminSession";

const ROLE_LABEL: Readonly<Record<RoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "DEFAULT_ADMIN",
  MINTER_ROLE: "MINTER",
  RECEPTION_ROLE: "RECEPTION",
  PAUSER_ROLE: "PAUSER",
  BURNER_ROLE: "BURNER",
  TREASURER_ROLE: "TREASURER",
};

/** Contexto de sesión del back-office: los paneles lo consumen sin reabrir SIWE (DRY). */
const AdminSessionContext = createContext<AdminSession | null>(null);

/** Sesión del back-office para los paneles hijos. Debe usarse dentro de `AdminLayout`. */
export function useAdminContext(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminContext debe usarse dentro de <AdminLayout>.");
  return ctx;
}

/** Id del `<aside>` que gobiernan los dos botones de plegado (móvil y escritorio). */
const SIDEBAR_ID = "admin-sidebar";

/** Marca circular de la marca (coherente con la cabecera pública, docs/SRS.md §7). */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="h-[30px] w-[30px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]"
      style={{
        background:
          "radial-gradient(circle at 32% 30%, var(--gold), var(--terracotta) 55%, var(--sea) 130%)",
      }}
    />
  );
}

/**
 * Barra lateral izquierda (distribución AdminLTE, 2026-09-29). Es el único bloque `ocean` del
 * back-office y agrupa marca, acordeón de secciones y el grupo Sistemas.
 *
 * Dos modos, con un solo estado cada uno:
 *   · **Escritorio**: fija (`sticky`) y plegable a *mini* (solo iconos, etiquetas `sr-only`).
 *   · **Móvil**: cajón fuera de pantalla; **cerrado no se pinta** (`hidden`) para que no quede
 *     contenido fuera de vista pero enfocable con el tabulador.
 */
function Sidebar({
  session,
  mini,
  onToggleMini,
  drawerOpen,
  panelRef,
}: {
  session: AdminSession;
  mini: boolean;
  onToggleMini: () => void;
  drawerOpen: boolean;
  panelRef: RefObject<HTMLElement>;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  // Hint de bloqueo accesible una sola vez, referenciado por cada item deshabilitado (MINOR#38).
  const lockedHintId = useId();

  const navLabel = (key: AdminNavLabelKey) => t(`nav.${key}` as `nav.${AdminNavLabelKey}`);

  // D-29: acordeón de UNA sección abierta a la vez. La sección abierta se **resincroniza con la
  // ruta** (enlace profundo, atrás/adelante, recarga): antes se fijaba solo al montar y la entrada
  // activa podía quedar dentro de una sección cerrada.
  const [openSection, setOpenSection] = useState<AdminSectionKey | null>(() => sectionForPathname(pathname));
  useEffect(() => {
    setOpenSection(sectionForPathname(pathname));
  }, [pathname]);

  const itemEnabled = (item: AdminNavItem): boolean =>
    item.role === null ? true : session.hasRole(item.role);

  /** Etiqueta visible en escritorio y `sr-only` con el sidebar plegado (nunca desaparece del DOM). */
  const labelClass = mini ? "tablet:sr-only" : undefined;

  const renderItem = (item: AdminNavItem) => {
    const enabled = itemEnabled(item);
    const active = isActiveHref(pathname, item.href);
    const label = navLabel(item.labelKey);
    if (!enabled) {
      return (
        <span
          key={item.href}
          aria-disabled="true"
          aria-describedby={lockedHintId}
          title={t("nav.lockedHint")}
          className="flex min-h-touch items-center gap-2 rounded-brand px-3 text-small font-medium text-sand opacity-50"
        >
          <span aria-hidden="true">·</span>
          {label}
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-touch items-center gap-2 rounded-brand px-3 text-small font-medium transition-colors ${
          active ? "bg-shell font-semibold text-ocean" : "text-sand hover:bg-ocean-soft hover:text-shell"
        }`}
      >
        <span aria-hidden="true">·</span>
        {label}
      </Link>
    );
  };

  return (
    <aside
      id={SIDEBAR_ID}
      ref={panelRef}
      tabIndex={-1}
      aria-label={t("nav.sidebar")}
      className={[
        // Móvil: cajón. Cerrado no se pinta (fuera del orden de tabulación).
        drawerOpen ? "fixed inset-y-0 left-0 z-50 flex shadow-modal" : "hidden tablet:flex",
        "w-72 flex-col bg-ocean text-sand outline-none",
        // Escritorio: vuelve al flujo, se pega arriba y mantiene su propio scroll.
        "tablet:sticky tablet:inset-y-auto tablet:top-0 tablet:z-30 tablet:h-screen tablet:overflow-y-auto tablet:shadow-none",
        mini ? "tablet:w-16" : "tablet:w-64",
      ].join(" ")}
    >
      <div className="flex min-h-[64px] flex-none items-center gap-3 px-4">
        <Link
          href="/admin/dashboard"
          aria-label={t("brandHome")}
          title={t("brandTitle")}
          className="flex min-w-0 flex-1 items-center gap-3 font-display text-[19px] font-semibold leading-none tracking-tight text-shell"
        >
          <BrandMark />
          <span className={mini ? "truncate tablet:sr-only" : "truncate"}>{t("brandTitle")}</span>
        </Link>
        {/* Plegado a mini: solo escritorio (en móvil el cajón es siempre ancho). */}
        <button
          type="button"
          data-testid="admin-sidebar-collapse"
          aria-expanded={!mini}
          aria-controls={SIDEBAR_ID}
          aria-label={mini ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          title={mini ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          onClick={onToggleMini}
          className="hidden min-h-touch min-w-touch flex-none items-center justify-center rounded-brand text-champagne transition-colors hover:bg-ocean-soft tablet:inline-flex"
        >
          <CollapseIcon collapsed={mini} />
        </button>
      </div>

      <nav aria-label={t("nav.label")} className="flex flex-1 flex-col gap-1 px-3 pb-4">
        {/* Motivo de bloqueo accesible (sr-only): los items deshabilitados lo referencian con
            `aria-describedby`, no solo en `title` dependiente de hover (MINOR#38). */}
        <span id={lockedHintId} className="sr-only">
          {t("nav.lockedHint")}
        </span>

        {ADMIN_NAV_SECTIONS.map((section) => {
          // Con el sidebar plegado ningún panel cabe: la sección se abre al desplegarlo.
          const open = openSection === section.key && !mini;
          const SectionIcon = ADMIN_ICONS[section.icon];
          const label = navLabel(section.labelKey);
          return (
            <div key={section.key} className="flex flex-col">
              <button
                type="button"
                data-testid={`nav-section-${section.key}`}
                aria-expanded={open}
                aria-controls={`nav-section-panel-${section.key}`}
                title={label}
                onClick={() => {
                  if (mini) {
                    onToggleMini();
                    setOpenSection(section.key);
                    return;
                  }
                  setOpenSection((current) => (current === section.key ? null : section.key));
                }}
                className="flex min-h-touch items-center gap-2 rounded-brand px-3 text-left text-small font-semibold text-champagne transition-colors hover:bg-ocean-soft"
              >
                <SectionIcon className="flex-none" />
                <span className={labelClass}>{label}</span>
                <ChevronIcon
                  className={`ml-auto flex-none transition-transform ${open ? "rotate-90" : ""} ${
                    mini ? "tablet:hidden" : ""
                  }`}
                />
              </button>
              {/*
                El plegado va por CLASE, nunca por el atributo `hidden`: el preflight de Tailwind v3
                declara `[hidden]:where(:not([hidden=until-found])){display:none}` en la capa base y
                con especificidad (0,1,0) —`:where()` no suma—, así que el `display:flex` de la
                utilidad (misma especificidad y POSTERIOR en la hoja) lo anulaba y las siete
                secciones se veían siempre abiertas.
              */}
              <ul
                id={`nav-section-panel-${section.key}`}
                className={open ? "mt-1 flex flex-col gap-1" : "hidden"}
              >
                {section.items.map((item) => (
                  <li key={item.href}>{renderItem(item)}</li>
                ))}

                {/* Subgrupo del owner (D-80): las funciones especiales de Sistemas, integradas en el
                    panel Administración. El gating real lo imponen rutas y APIs. */}
                {section.ownerGroup && session.isOwner && (
                  <OwnerGroup group={section.ownerGroup} navLabel={navLabel} renderItem={renderItem} />
                )}

                {/* Bloque de sesión (D-81): usuario + billetera, dentro del panel Administración. */}
                {section.key === "administracion" && <SessionBlock session={session} />}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Pie del sidebar: contexto de la aplicación, oculto con el sidebar plegado. */}
      <p className={`flex-none border-t border-champagne/30 px-4 py-3 text-micro text-champagne ${mini ? "tablet:hidden" : ""}`}>
        {t("nav.footer")}
      </p>
    </aside>
  );
}

/**
 * Subgrupo anidado dentro del panel de una sección, reservado al owner (**D-80**): es la integración
 * de las funciones especiales de Sistemas en el panel Administración. Se dibuja como una fila de
 * encabezado con su icono y las entradas debajo, separadas por un filete para que el nivel jerárquico
 * sea visible sin recurrir solo al color (WCAG 1.4.1).
 */
function OwnerGroup({
  group,
  navLabel,
  renderItem,
}: {
  group: AdminNavGroup;
  navLabel: (key: AdminNavLabelKey) => string;
  renderItem: (item: AdminNavItem) => ReactNode;
}) {
  const GroupIcon = ADMIN_ICONS[group.icon];
  return (
    <li data-testid="nav-owner-group" className="mt-2 flex flex-col gap-1 border-t border-champagne/30 pt-2">
      <span className="flex items-center gap-2 px-3 pb-1 text-micro font-semibold uppercase tracking-wider text-champagne">
        <GroupIcon className="flex-none" />
        {navLabel(group.labelKey)}
      </span>
      {group.items.map(renderItem)}
    </li>
  );
}

/**
 * Bloque de sesión del panel Administración (**D-81**): usuario + rol, roles de la sesión y el menú
 * unificado de billetera (conectar / cambiar red / desconectar, Mi seguridad, Salir — RF-40).
 *
 * Vive **dentro del panel**, no en la barra superior, que desde esta decisión queda para un único
 * destino: la sección Ayuda. El `WalletMenu` se usa con `variant="sidebar"` porque el desplegable
 * necesita anclarse al viewport: el sidebar es un contenedor con `overflow-y-auto` y recortaría un
 * descendiente en `absolute`.
 */
function SessionBlock({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");

  return (
    <li data-testid="admin-session-block" className="mt-3 flex flex-col gap-2 border-t border-champagne/30 pt-3">
      <span className="flex items-center gap-2 px-3 text-micro font-semibold uppercase tracking-wider text-champagne">
        <UserIcon className="flex-none" />
        {t("nav.sessionTitle")}
      </span>
      <div className="px-3">
        <WalletMenu session={session} variant="sidebar" />
      </div>
      <ul data-testid="admin-roles" className="flex flex-wrap items-center gap-1.5 px-3">
        {session.roles.map((role) => (
          <li
            key={role}
            className="rounded-pill bg-sand-2 px-2.5 py-1 text-micro font-semibold uppercase tracking-wide text-sea-deep"
          >
            {ROLE_LABEL[role]}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Barra superior (**D-81**): su único destino de navegación es la sección **Ayuda**. Lo demás se fue
 * del navbar —los roles y la billetera viven ahora en el panel Administración del sidebar— y solo
 * quedan los controles estructurales: la hamburguesa que abre el cajón en móvil y, allí mismo, la
 * marca (en escritorio preside el sidebar). Es `sticky` para que el acceso a Ayuda no se pierda al
 * bajar por una tabla larga.
 */
function Topbar({
  drawerOpen,
  onToggleDrawer,
  toggleRef,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  toggleRef: RefObject<HTMLButtonElement>;
}) {
  const t = useTranslations("admin");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sand/90 backdrop-blur">
      <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 tablet:px-5">
        <button
          ref={toggleRef}
          type="button"
          data-testid="admin-nav-toggle"
          aria-expanded={drawerOpen}
          aria-controls={SIDEBAR_ID}
          aria-label={drawerOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          onClick={onToggleDrawer}
          className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-brand border border-line-strong text-ink transition-colors hover:bg-sand-2 tablet:hidden"
        >
          <MenuIcon />
        </button>

        {/* En móvil la marca vive aquí (en escritorio preside el sidebar). */}
        <Link
          href="/admin/dashboard"
          aria-label={t("brandHome")}
          className="flex min-w-0 items-center gap-2 font-display text-[19px] font-semibold leading-none tracking-tight text-ink tablet:hidden"
        >
          <BrandMark />
          <span className="truncate">{t("brandTitle")}</span>
        </Link>

        <div className="ml-auto flex items-center">
          <Link
            href="/ayuda"
            data-testid="admin-help-link"
            className="inline-flex min-h-touch items-center gap-2 rounded-pill border border-line-strong px-3 text-small font-medium text-ink transition-colors hover:bg-sand-2"
          >
            <HelpIcon className="flex-none" />
            {t("nav.ayuda")}
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * Cabecera de contenido (AdminLTE `content-header` con migas). Se **deriva de la ruta** para no
 * tocar las 23 páginas del back-office: cada panel sigue titulando con su `AdminPanel`.
 */
function ContentHeader() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const crumbs = breadcrumbForPathname(pathname);
  if (crumbs.length === 0) return null;

  return (
    <div className="border-b border-line bg-sand-2/50">
      <div className="mx-auto w-full max-w-6xl px-5 py-2.5">
        <nav aria-label={t("nav.breadcrumb")}>
          <ol className="flex flex-wrap items-center gap-2 text-micro text-ink-soft">
            <li>
              <Link href="/admin/dashboard" className="rounded-brand-xs hover:text-sea">
                {t("nav.home")}
              </Link>
            </li>
            {crumbs.map((crumb, index) => {
              const current = index === crumbs.length - 1;
              return (
                <li key={crumb.href} className="flex items-center gap-2">
                  <span aria-hidden="true">›</span>
                  {current ? (
                    <span aria-current="page" className="font-semibold text-ink">
                      {t(`nav.${crumb.labelKey}` as `nav.${AdminNavLabelKey}`)}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="rounded-brand-xs hover:text-sea">
                      {t(`nav.${crumb.labelKey}` as `nav.${AdminNavLabelKey}`)}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

/** Pie de la plantilla (AdminLTE `main-footer`). */
function Footer() {
  const t = useTranslations("admin");
  return (
    <footer className="border-t border-line bg-shell">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-5 py-3 text-micro text-ink-soft">
        <span>{t("brandTitle")}</span>
        <span aria-hidden="true">·</span>
        <span>{t("nav.footer")}</span>
      </div>
    </footer>
  );
}

/**
 * Pantalla de acceso canónica (D-04): usuario + contraseña + TOTP obligatorio.
 * No usa SIWE: la wallet ya no autoriza el back-office.
 */
function SignInGate({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 rounded-brand-lg border border-line bg-shell p-6 shadow-card">
      <h1 className="font-display text-h3 font-semibold text-ink">{t("gateTitle")}</h1>
      <CredentialForm session={session} />
    </div>
  );
}

/**
 * Plantilla del back-office (docs/SRS.md §7), **redistribuida al estilo AdminLTE** (decisión del
 * responsable, 2026-09-29): sidebar fija a la izquierda con marca y acordeón, navbar superior con
 * roles y billetera, `content-header` con migas, `content-wrapper` y pie.
 *
 * Centraliza la sesión canónica (D-04): sin sesión muestra la pantalla de acceso (usuario +
 * contraseña + TOTP); con sesión, las entradas/paneles se habilitan o deshabilitan según el rol.
 * Es el shell de admin, NO el `PublicShell` público.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const session = useAdminSession();
  const pathname = usePathname();

  // Mini-sidebar (solo escritorio) y cajón (solo móvil): estados independientes, sin almacenamiento
  // persistente para no arriesgar un desajuste de hidratación entre servidor y cliente.
  const [mini, setMini] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback((returnFocus = false) => {
    setDrawerOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Al navegar, el cajón se cierra: la página destino queda visible (y el foco no salta).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Si la ventana pasa a escritorio con el cajón abierto, se cierra: allí no hay cajón y el bloqueo
  // de scroll del fondo se quedaría puesto (el breakpoint se toma de la constante compartida para
  // no divergir del preset de Tailwind).
  useEffect(() => {
    const desktop = window.matchMedia(`(min-width: ${BREAKPOINT_TABLET_PX}px)`);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  // Cajón abierto: `Escape` cierra y devuelve el foco al botón; el fondo no hace scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer(true);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El foco entra en el panel para que el tabulador no siga por la página de fondo.
    sidebarRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, closeDrawer]);

  const hasSession = Boolean(session.sessionUsername);

  const shell = (body: ReactNode) => (
    <div className="flex min-h-screen bg-sand">
      <a
        href="#admin-contenido"
        className="sr-only z-50 rounded-br-brand-sm bg-sea px-4 py-3 font-semibold text-shell focus:not-sr-only focus:absolute focus:left-0 focus:top-0"
      >
        {t("skipToContent")}
      </a>

      {hasSession && (
        <Sidebar
          session={session}
          mini={mini}
          onToggleMini={() => setMini((value) => !value)}
          drawerOpen={drawerOpen}
          panelRef={sidebarRef}
        />
      )}

      {/* Velo del cajón (móvil): cierra al pulsarlo y nunca aparece en escritorio. */}
      {hasSession && drawerOpen && (
        <button
          type="button"
          aria-label={t("nav.closeMenu")}
          onClick={() => closeDrawer(true)}
          className="fixed inset-0 z-40 cursor-default bg-ocean/60 tablet:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((open) => !open)}
          toggleRef={toggleRef}
        />
        {hasSession && <ContentHeader />}
        <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
          <main id="admin-contenido" tabIndex={-1} className="min-w-0 outline-none">
            {body}
          </main>
        </div>
        <Footer />
      </div>
    </div>
  );

  if (session.isLoading) {
    return shell(
      <p role="status" aria-live="polite" className="text-ink-soft">
        {t("loadingSession")}
      </p>,
    );
  }

  if (!hasSession) {
    return shell(<SignInGate session={session} />);
  }

  return (
    <AdminSessionContext.Provider value={session}>
      {shell(children)}
    </AdminSessionContext.Provider>
  );
}
