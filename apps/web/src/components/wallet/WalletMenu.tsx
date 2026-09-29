"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { BackOfficeRoleName } from "@hotel/shared/domain";
import type { AdminSession } from "@/components/admin/useAdminSession";
import { walletMenuItems, type WalletMenuAction } from "@/lib/wallet-menu-items";
import { useOnboarding } from "./useOnboarding";
import { FaucetButton } from "./FaucetButton";

/**
 * Etiqueta i18n de cada rol de operador (namespace `walletMenu`). Incluye los roles de personal sin
 * wallet (`HOUSEKEEPING`, `MAINTENANCE`, D-56) para que la insignia del menú público no quede vacía.
 */
const ROLE_KEY: Readonly<Record<BackOfficeRoleName, string>> = {
  DEFAULT_ADMIN_ROLE: "roleDefaultAdmin",
  RECEPTION_ROLE: "roleReception",
  HOUSEKEEPING: "roleHousekeeping",
  MAINTENANCE: "roleMaintenance",
};

/** Roles on-chain que no son de back-office directo (minter, pauser, burner, tesorería). */
const ONCHAIN_ROLE_KEY: Readonly<Record<string, string>> = {
  MINTER_ROLE: "roleMinter",
  PAUSER_ROLE: "rolePauser",
  BURNER_ROLE: "roleBurner",
  TREASURER_ROLE: "roleTreasurer",
};

function roleLabelKey(role: string | undefined): string | undefined {
  if (!role) return undefined;
  return (ROLE_KEY as Readonly<Record<string, string>>)[role] ?? ONCHAIN_ROLE_KEY[role];
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const ITEM =
  "flex min-h-touch w-full items-center gap-2 rounded-brand-sm px-3 text-left text-small text-ink transition-colors hover:bg-sand-2";

/** Claves de acción que abren otra suite (D-77), para agruparlas bajo un encabezado. */
const SUITE_ACTIONS = new Set<WalletMenuAction>([
  "suiteAdmin",
  "suiteReception",
  "suiteHousekeeping",
  "suiteMaintenance",
]);

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
/** Ancho del panel desplegable (`w-64`): se fija a propósito para poder anclarlo al viewport. */
const PANEL_WIDTH_PX = 256;
/** Separación del disparador y margen mínimo contra los bordes de la ventana. */
const PANEL_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

export interface WalletMenuProps {
  readonly session?: AdminSession;
  /**
   * `"header"` (por defecto): panel en `absolute`, como siempre —la cabecera pública no recorta.
   * `"sidebar"`: panel **fijo al viewport**, medido sobre el disparador. Es lo que necesita el
   * back-office, donde el menú vive dentro del sidebar (`AdminLTE`) cuyo contenedor tiene
   * `overflow-y-auto`: un descendiente `absolute` quedaría recortado por ese scroll.
   */
  readonly variant?: "header" | "sidebar";
}

export function WalletMenu({ session, variant = "header" }: WalletMenuProps) {
  const t = useTranslations("walletMenu");
  const router = useRouter();
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>(undefined);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasSession = Boolean(session?.sessionUsername);
  const isOwner = session?.isOwner ?? false;
  const isConnected = onboarding.isConnected;
  const isWrongNetwork = onboarding.isWrongNetwork;

  /**
   * Anclaje al viewport (variante `sidebar`). Se mide primero con una altura estimada y se vuelve a
   * medir en el siguiente frame, cuando el panel ya existe y su altura es real: así el cambio de lado
   * (debajo → encima del disparador) no depende de un número escrito a mano.
   */
  useLayoutEffect(() => {
    if (!open || variant !== "sidebar") return;

    const place = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const height = panelRef.current?.offsetHeight ?? 320;
      const spaceBelow = window.innerHeight - trigger.bottom;
      const top =
        spaceBelow >= height + PANEL_GAP_PX
          ? trigger.bottom + PANEL_GAP_PX
          : Math.max(VIEWPORT_MARGIN_PX, trigger.top - height - PANEL_GAP_PX);
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN_PX, trigger.right - PANEL_WIDTH_PX),
        Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - PANEL_WIDTH_PX - VIEWPORT_MARGIN_PX),
      );
      setPanelStyle({ position: "fixed", top, left, width: PANEL_WIDTH_PX });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    // `capture: true`: el sidebar tiene su propio scroll, que no burbuja.
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, variant]);

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

  const items = walletMenuItems({
    hasSession,
    isOwner,
    isConnected,
    isWrongNetwork,
    roles: session?.roles ?? [],
  });

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
  const roleKey = roleLabelKey(role);
  const firstSuite = items.find((item) => SUITE_ACTIONS.has(item.action));
  const title = hasSession
    ? session?.sessionUsername ?? ""
    : isConnected && onboarding.address
      ? short(onboarding.address)
      : t("notConnected");

  // En el sidebar (`ocean`) el disparador ocupa la fila completa: así el nombre de usuario no se
  // trunca contra los chips y el área táctil llega al ancho útil del panel.
  const triggerClass = [
    "inline-flex min-h-touch items-center gap-2 rounded-pill border px-3 text-small font-medium transition-colors",
    variant === "sidebar"
      ? "w-full justify-between border-line-strong bg-shell text-ink hover:bg-sand-2"
      : "border-line bg-shell text-ink hover:bg-sand-2",
  ].join(" ");

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
        className={triggerClass}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-none rounded-full ${isConnected ? "bg-olive" : "bg-ink-soft/50"}`}
        />
        <span data-testid="wallet-menu-title" className="max-w-[16ch] truncate">
          {title}
        </span>
        {hasSession && roleKey && (
          <span className="rounded-pill bg-sand-2 px-2 py-0.5 text-micro font-semibold uppercase tracking-wide text-sea-deep">
            {t(roleKey as "roleDefaultAdmin")}
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
            style={panelStyle}
            className={[
              "z-50 rounded-brand-lg border border-line bg-shell p-2 shadow-card",
              // `absolute` solo en la variante de cabecera; en `sidebar` manda `panelStyle` (fixed).
              panelStyle ? "" : "absolute right-0 top-full mt-2 w-64",
            ].join(" ")}
          >
            <p className="px-3 py-2 text-micro uppercase tracking-wide text-ink-soft">
              {hasSession ? t("sessionTitle") : t("walletTitle")}
            </p>

            {items.map((item) => {
              const label = t(item.action as "security");
              const entry = item.href ? (
                <Link
                  key={item.action}
                  href={item.href}
                  role="menuitem"
                  onClick={close}
                  className={ITEM}
                >
                  {label}
                </Link>
              ) : (
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

              // Encabezado «Tus suites» (D-77) justo antes del primer acceso a otra suite.
              if (item === firstSuite) {
                return (
                  <Fragment key={`group-${item.action}`}>
                    <p
                      role="presentation"
                      className="mt-1 px-3 py-2 text-micro uppercase tracking-wide text-ink-soft"
                    >
                      {t("suitesTitle")}
                    </p>
                    {entry}
                  </Fragment>
                );
              }
              return entry;
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
