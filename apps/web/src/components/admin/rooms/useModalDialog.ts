"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

/**
 * Comportamiento accesible **compartido** por los diálogos flotantes de la sección Habitación
 * (2026-10-02): el formulario de alta/edición y la ficha de detalle.
 *
 * Qué garantiza (WCAG 2.1 · 2.1.2, 2.4.3, 4.1.2; el mismo patrón que `TxModal`):
 *   · `role="dialog"` + `aria-modal` + `aria-labelledby` con un id estable (`titleId`).
 *   · Foco al **primer campo** al abrir (o al control que indique `initialFocus`).
 *   · Foco **atrapado** dentro del panel mientras está abierto (Tab y Shift+Tab ciclan).
 *   · `Escape` cierra, salvo que `enabled` sea `false` (hay otro diálogo encima: el TOTP de
 *     publicación o el propio formulario), en cuyo caso el de arriba manda.
 *   · Al cerrarse, el foco **vuelve al disparador** que abrió el diálogo (si sigue en el DOM).
 *   · El fondo no hace scroll mientras hay un diálogo abierto.
 *
 * Por qué un hook y no copiar el bloque en cada modal: la trampa de foco es la parte fácil de
 * olvidar (y de duplicar mal); con dos diálogos nuevos en la misma sección, una sola implementación
 * revisada vale para los dos. El diálogo se **monta y se desmonta** (el padre lo renderiza
 * condicionalmente), así que los efectos se suscriben una vez al montar.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalDialogOptions {
  /** Cierra el diálogo (botón de cierre, velo o `Escape`). */
  onClose: () => void;
  /** `false` cuando hay otro diálogo apilado encima: ese otro manda con `Escape` y con Tab. */
  enabled?: boolean;
  /** Control que recibe el foco al abrir; por defecto, el primer control del panel. */
  initialFocus?: RefObject<HTMLElement>;
}

export interface ModalDialogBinding {
  /** Se ata al contenedor del diálogo (`<div ref={panelRef} role="dialog" …>`). */
  panelRef: RefObject<HTMLDivElement>;
  /** Id del título del diálogo, para `aria-labelledby`. */
  titleId: string;
}

export function useModalDialog({
  onClose,
  enabled = true,
  initialFocus,
}: ModalDialogOptions): ModalDialogBinding {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // El cierre y el apilado se leen por referencia: el efecto se suscribe UNA vez (al montar) y no
  // debe re-suscribirse cuando el padre pasa una función nueva en cada render.
  const onCloseRef = useRef(onClose);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first =
      initialFocus?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    first?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!enabledRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const current = panelRef.current;
      if (!current) return;
      const focusables = Array.from(current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstFocusable = focusables[0];
      const lastFocusable = focusables[focusables.length - 1];
      if (!firstFocusable || !lastFocusable) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !current.contains(active)) {
        event.preventDefault();
        firstFocusable.focus();
        return;
      }
      if (event.shiftKey && active === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && active === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // El fondo no se desplaza mientras el diálogo está abierto; con dos diálogos apilados el de
    // dentro guarda "hidden" como valor previo y el de fuera restaura el original.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Devolución del foco al disparador: si desapareció (p. ej. la tabla se recargó), no se toca.
      if (trigger && trigger.isConnected) trigger.focus?.();
    };
  }, [initialFocus]);

  return { panelRef, titleId };
}
