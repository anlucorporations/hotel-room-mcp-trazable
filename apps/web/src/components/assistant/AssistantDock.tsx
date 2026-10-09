"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import type { AssistantPageAction } from "@/lib/assistant/page-action";
import { AssistantChat } from "./AssistantChat";

/**
 * Asistente IA en toda la plataforma (incremento v4).
 *
 * Tres piezas que comparten un mismo panel:
 *  - {@link AssistantUiProvider} — estado abierto/cerrado, compartido por la cabecera y el dock.
 *  - {@link AssistantHeaderTrigger} — **versión móvil**: el avatar en la cabecera (`<tablet`).
 *  - {@link AssistantDock} — **versión PC**: icono flotante abajo a la derecha (`≥tablet`) y el
 *    panel de conversación desplegable, «al estilo de caja de herramientas».
 *
 * La conversación es la misma de `/asistente` (`AssistantChat`): el widget no es un asistente
 * distinto, es el mismo con otra carcasa. Por eso en `/asistente` el dock y el disparador se
 * ocultan: allí la conversación ya ocupa la página entera.
 */

/** Ruta que ya ES el asistente: en ella no se duplica el acceso. */
const ASSISTANT_PAGE = "/asistente";

/** Id estable del panel: lo referencian los dos disparadores con `aria-controls`. */
export const ASSISTANT_PANEL_ID = "assistant-panel";

/** Avatar grande (80×80) para el lanzador flotante de escritorio. */
const AVATAR_LARGE = "/images/avatar_hotel_80x80.webp";
/** Avatar pequeño (40×40) para la cabecera móvil y el encabezado del panel. */
const AVATAR_SMALL = "/images/avatar_hotel_40x40.webp";

interface AssistantUiState {
  readonly open: boolean;
  toggle: () => void;
  close: () => void;
}

/**
 * Estado compartido del panel. Fuera del proveedor devuelve un no-op: una cabecera suelta no debe
 * romper el render por no tener el asistente montado.
 */
const NO_UI: AssistantUiState = { open: false, toggle: () => undefined, close: () => undefined };

const AssistantUiContext = createContext<AssistantUiState | null>(null);

export function useAssistantUi(): AssistantUiState {
  return useContext(AssistantUiContext) ?? NO_UI;
}

/** Provee el estado del panel a la cabecera y al dock (envolver ambos con él). */
export function AssistantUiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // `close` y `toggle` estables: son dependencias de efectos y no deben re-dispararlos.
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const value = useMemo<AssistantUiState>(() => ({ open, toggle, close }), [open, toggle, close]);
  return <AssistantUiContext.Provider value={value}>{children}</AssistantUiContext.Provider>;
}

/**
 * Disparador de la **cabecera móvil** (`<tablet`): el avatar de 40×40 que abre la conversación.
 * En escritorio lo sustituye el icono flotante. Se oculta en `/asistente`, y también se oculta
 * —con el dock— cuando el proveedor no está montado.
 */
export function AssistantHeaderTrigger() {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const ui = useContext(AssistantUiContext);
  if (ui === null || pathname === ASSISTANT_PAGE) return null;

  return (
    <button
      type="button"
      onClick={ui.toggle}
      data-testid="assistant-header-trigger"
      aria-expanded={ui.open}
      aria-controls={ui.open ? ASSISTANT_PANEL_ID : undefined}
      aria-label={ui.open ? t("panelClose") : t("launcherOpen")}
      className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-full transition-colors hover:bg-mist-2 tablet:hidden"
    >
      <Image
        src={AVATAR_SMALL}
        alt=""
        width={40}
        height={40}
        className="h-8 w-8 rounded-full"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Dock del asistente (incremento v4): lanzador flotante abajo a la derecha en escritorio y panel
 * de conversación desplegable. El panel cierra con Escape, al navegar y al enviar una consulta que
 * tiene resultado en la página (para no taparlo).
 */
export function AssistantDock() {
  const t = useTranslations("assistant");
  const pathname = usePathname();
  const router = useRouter();
  const ui = useContext(AssistantUiContext);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Cierre con Escape devolviendo el foco al lanzador (mismo patrón que el menú móvil, MAJOR#10).
  useEffect(() => {
    if (ui === null || !ui.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        ui.close();
        launcherRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ui]);

  // Al cambiar de ruta se cierra el panel (evita el panel «fantasma» de la página anterior).
  const close = ui?.close;
  useEffect(() => {
    close?.();
  }, [pathname, close]);

  // La consulta se enseña EN LA PÁGINA: se navega al catálogo filtrado y se aparta el panel.
  const onPageAction = useCallback(
    (action: AssistantPageAction) => {
      close?.();
      router.push(action.href);
    },
    [close, router],
  );

  // Sin proveedor o en la propia página del asistente no hay nada que pintar.
  if (ui === null || pathname === ASSISTANT_PAGE) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={ui.toggle}
        data-testid="assistant-launcher"
        aria-expanded={ui.open}
        aria-controls={ui.open ? ASSISTANT_PANEL_ID : undefined}
        aria-label={ui.open ? t("panelClose") : t("launcherOpen")}
        className="fixed bottom-6 right-6 z-40 hidden h-16 w-16 items-center justify-center rounded-full border border-line bg-shell shadow-modal transition-transform hover:scale-105 tablet:flex"
      >
        <Image
          src={AVATAR_LARGE}
          alt=""
          width={80}
          height={80}
          className="h-16 w-16 rounded-full object-cover"
          aria-hidden="true"
        />
      </button>

      {ui.open && (
        <section
          id={ASSISTANT_PANEL_ID}
          role="dialog"
          aria-label={t("panelTitle")}
          data-testid="assistant-panel"
          // Altura FIJA y columna flex: el encabezado y el compositor no se mueven y solo el
          // historial hace scroll. Sin esto, en móvil el panel crecía con el contenido y el
          // historial podía tapar el botón de envío (defecto detectado con el viewport de Pixel 5).
          className="fixed inset-x-3 bottom-3 z-50 flex h-[min(80vh,32rem)] flex-col overflow-hidden rounded-brand-lg border border-line bg-mist shadow-modal tablet:inset-x-auto tablet:bottom-24 tablet:right-6 tablet:w-[26rem]"
        >
          <header className="flex flex-none items-center gap-3 border-b border-line bg-shell px-4 py-3">
            <Image
              src={AVATAR_SMALL}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 flex-none rounded-full"
              aria-hidden="true"
            />
            <h2 className="font-display text-h3 font-semibold">{t("panelTitle")}</h2>
            <button
              type="button"
              onClick={ui.close}
              data-testid="assistant-panel-close"
              aria-label={t("panelClose")}
              className="ml-auto inline-flex min-h-touch min-w-touch items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-mist-2 hover:text-ink"
            >
              <span aria-hidden="true" className="text-h3 leading-none">
                ×
              </span>
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <AssistantChat variant="panel" onPageAction={onPageAction} />
          </div>
        </section>
      )}
    </>
  );
}
