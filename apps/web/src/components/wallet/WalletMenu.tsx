"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { RoleName } from "@hotel/shared/domain";
import type { AdminSession } from "@/components/admin/useAdminSession";
import { walletMenuItems, type WalletMenuAction } from "@/lib/wallet-menu-items";
import { useOnboarding } from "./useOnboarding";
import { FaucetButton } from "./FaucetButton";

/** Etiqueta i18n de cada rol on-chain (namespace `walletMenu`). */
const ROLE_KEY: Readonly<Record<RoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "roleDefaultAdmin",
  MINTER_ROLE: "roleMinter",
  RECEPTION_ROLE: "roleReception",
  PAUSER_ROLE: "rolePauser",
  BURNER_ROLE: "roleBurner",
  TREASURER_ROLE: "roleTreasurer",
};

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const ITEM =
  "flex min-h-touch w-full items-center gap-2 rounded-brand-sm px-3 text-left text-small text-ink transition-colors hover:bg-sand-2";

/**
 * Menú desplegable de la billetera/usuario (RF-40, CU-40).
 *
 * Un único componente para el back-office y la cabecera pública:
 *   - con `session` (back-office): el título muestra **usuario + rol** y el panel incluye
 *     Seguridad, Usuarios/Roles (solo owner) y Salir;
 *   - sin `session` (sitio público): el título muestra la **dirección de wallet** y el panel
 *     ofrece conectar/cambiar de red/desconectar y el acceso al back-office.
 *
 * Accesible por teclado: `aria-expanded`, cierre con `Escape`, foco al primer elemento al abrir y
 * retorno del foco al botón al cerrar (RF-40.3).
 */
export function WalletMenu({ session }: { session?: AdminSession }) {
  const t = useTranslations("walletMenu");
  const router = useRouter();
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasSession = Boolean(session?.sessionUsername);
  const isOwner = session?.isOwner ?? false;
  const isConnected = onboarding.isConnected;
  const isWrongNetwork = onboarding.isWrongNetwork;

  useEffect(() => {
    if (!open) return;
    // Foco al primer elemento del menú (sea enlace o botón) tras abrir.
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const items = walletMenuItems({ hasSession, isOwner, isConnected, isWrongNetwork });

  function close(): void {
    setOpen(false);
  }

  async function signOut(): Promise<void> {
    close();
    await session?.signOut();
    router.refresh();
  }

  function runWalletAction(action: WalletMenuAction): void {
    close();
    if (action === "connect") onboarding.connect();
    else if (action === "switchNetwork") onboarding.switchToAppChain();
    else if (action === "disconnect") onboarding.disconnect();
  }

  const role = session?.roles[0];
  const title = hasSession
    ? session?.sessionUsername ?? ""
    : isConnected && onboarding.address
      ? short(onboarding.address)
      : t("notConnected");

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="wallet-menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("close") : t("open")}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-touch items-center gap-2 rounded-pill border border-line bg-shell px-3 text-small font-medium text-ink transition-colors hover:bg-sand-2"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-none rounded-full ${isConnected ? "bg-olive" : "bg-ink-soft/50"}`}
        />
        <span data-testid="wallet-menu-title" className="max-w-[16ch] truncate">
          {title}
        </span>
        {hasSession && role && (
          <span className="rounded-pill bg-sand-2 px-2 py-0.5 text-micro font-semibold uppercase tracking-wide text-sea-deep">
            {t(ROLE_KEY[role] as "roleDefaultAdmin")}
          </span>
        )}
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Capa para cerrar al pulsar fuera (no captura foco). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            id={panelId}
            ref={panelRef}
            role="menu"
            aria-label={t("menuLabel")}
            data-testid="wallet-menu-panel"
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-brand-lg border border-line bg-shell p-2 shadow-card"
          >
            <p className="px-3 py-2 text-micro uppercase tracking-wide text-ink-soft">
              {hasSession ? t("sessionTitle") : t("walletTitle")}
            </p>

            {items.map((item) => {
              const label = t(item.action as "security");
              if (item.href) {
                return (
                  <Link
                    key={item.action}
                    href={item.href}
                    role="menuitem"
                    onClick={close}
                    className={ITEM}
                  >
                    {label}
                  </Link>
                );
              }
              return (
                <button
                  key={item.action}
                  type="button"
                  role="menuitem"
                  onClick={() => (item.action === "signOut" ? void signOut() : runWalletAction(item.action))}
                  className={ITEM}
                >
                  {label}
                </button>
              );
            })}

            <div className="mt-2 border-t border-line px-3 pt-2 empty:hidden">
              <FaucetButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
