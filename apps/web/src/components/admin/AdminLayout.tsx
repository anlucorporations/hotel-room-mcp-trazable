"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { RoleName } from "@hotel/shared";
import { WalletBar } from "@/components/wallet/WalletBar";
import { ADMIN_NAV, type AdminNavItem, type AdminNavLabelKey } from "./adminNav";
import { useAdminSession, type AdminSession } from "./useAdminSession";

const ROLE_LABEL: Readonly<Record<RoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "DEFAULT_ADMIN",
  MINTER_ROLE: "MINTER",
  ROYALTY_ADMIN_ROLE: "ROYALTY_ADMIN",
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

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Marca circular de la marca (coherente con la cabecera pública, DISEÑO-UX §3). */
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

function Sidebar({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");
  const pathname = usePathname();

  const itemEnabled = (item: AdminNavItem): boolean =>
    item.role === null ? true : session.hasRole(item.role);

  return (
    <nav
      aria-label={t("nav.label")}
      className="flex flex-col gap-1 border-line tablet:border-r tablet:pr-4"
    >
      {ADMIN_NAV.map((item) => {
        const enabled = itemEnabled(item);
        const active = isActive(pathname, item.href);
        const label = t(`nav.${item.labelKey}` as `nav.${AdminNavLabelKey}`);
        if (!enabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={t("nav.lockedHint")}
              className="flex min-h-touch items-center gap-2 rounded-brand px-3 text-small font-medium text-ink-soft opacity-50"
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
              active
                ? "bg-sea text-shell"
                : "text-ink-soft hover:bg-sand-2 hover:text-ink"
            }`}
          >
            <span aria-hidden="true">·</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Topbar({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");
  const router = useRouter();

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh(); // re-evalúa el gate server-side → vuelve a la pantalla de acceso.
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sand/85 backdrop-blur">
      <div className="mx-auto flex min-h-[64px] w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-2">
        <Link
          href="/admin/dashboard"
          aria-label={t("brandHome")}
          className="flex items-center gap-3 font-display text-[19px] font-semibold leading-none tracking-tight text-ink"
        >
          <BrandMark />
          {t("brandTitle")}
        </Link>

        {session.roles.length > 0 && (
          <ul data-testid="admin-roles" className="flex flex-wrap items-center gap-1.5">
            {session.roles.map((role) => (
              <li
                key={role}
                className="rounded-pill bg-sand-2 px-2.5 py-1 text-micro font-semibold uppercase tracking-wide text-sea-deep"
              >
                {ROLE_LABEL[role]}
              </li>
            ))}
          </ul>
        )}

        <div className="ml-auto flex items-center gap-2">
          {session.sessionAddress && (
            <button
              type="button"
              data-testid="admin-logout"
              onClick={() => void logout()}
              className="min-h-touch rounded-pill border border-line px-4 text-small font-medium text-ink-soft transition-colors hover:bg-sand-2 hover:text-ink"
            >
              {t("logout")}
            </button>
          )}
          <WalletBar />
        </div>
      </div>
    </header>
  );
}

/** Pantalla de gating SIWE: conectar wallet → firmar reto → sesión multi-rol (CU-01). */
function SignInGate({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");
  const { onboarding, isSigningIn, signInError } = session;
  const action =
    "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 rounded-brand-lg border border-line bg-shell p-6 shadow-card">
      <h1 className="font-display text-h3 font-semibold text-ink">{t("gateTitle")}</h1>
      {!onboarding.isConnected ? (
        <>
          <p className="text-ink-soft">{t("connectPrompt")}</p>
          <button type="button" onClick={onboarding.connect} className={action}>
            {t("connect")}
          </button>
        </>
      ) : onboarding.isWrongNetwork ? (
        <>
          <p data-testid="wrong-network" className="text-terracotta-text">
            {t("wrongNetwork")}
          </p>
          <button type="button" onClick={onboarding.switchToAppChain} className={action}>
            {t("switchNetwork")}
          </button>
        </>
      ) : (
        <>
          <p className="text-ink-soft">{t("signInPrompt")}</p>
          <button
            type="button"
            data-testid="admin-sign-in"
            onClick={() => void session.signIn()}
            disabled={isSigningIn}
            className={action}
          >
            {isSigningIn ? t("signingIn") : t("signIn")}
          </button>
          {signInError && (
            <p data-testid="auth-error" role="alert" className="text-terracotta-text">
              {signInError === "noRole" ? t("noRole") : t("signInFailed")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Plantilla del back-office (AdminLayout, DISEÑO-UX §3/§4.6): topbar con marca + roles del
 * usuario + estado de wallet, y sidebar navegable con `aria-current`. Centraliza el login SIWE
 * (CU-01): sin sesión muestra la pantalla de acceso; con sesión, las entradas/paneles se
 * habilitan o deshabilitan según el rol. Es el shell de admin, NO el PublicShell público.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const session = useAdminSession();

  const shell = (body: ReactNode) => (
    <div className="flex min-h-screen flex-col bg-sand">
      <a
        href="#admin-contenido"
        className="sr-only z-50 rounded-br-brand-sm bg-sea px-4 py-3 font-semibold text-shell focus:not-sr-only focus:absolute focus:left-0 focus:top-0"
      >
        {t("skipToContent")}
      </a>
      <Topbar session={session} />
      {session.sessionAddress && session.accountMismatch && (
        <div
          data-testid="account-mismatch"
          role="alert"
          className="border-b border-line bg-sand-2 px-5 py-3 text-small text-terracotta-text"
        >
          <span>{t("accountChanged")}</span>{" "}
          <button
            type="button"
            onClick={() => void session.signIn()}
            className="font-semibold underline"
          >
            {t("resign")}
          </button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 tablet:flex-row">
        {session.sessionAddress && <aside className="tablet:w-56 tablet:flex-none"><Sidebar session={session} /></aside>}
        <main id="admin-contenido" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {body}
        </main>
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

  if (!session.sessionAddress) {
    return shell(<SignInGate session={session} />);
  }

  return (
    <AdminSessionContext.Provider value={session}>
      {shell(children)}
    </AdminSessionContext.Provider>
  );
}
