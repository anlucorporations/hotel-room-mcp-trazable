"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import type { AssistantPageAction } from "@/lib/assistant/page-action";
import { useAssistant } from "./useAssistant";
import { PurchaseHandoff } from "./PurchaseHandoff";

/** Altura máxima (px) del `<textarea>` autoexpandible antes de mostrar scroll interno (UX#16). */
const TEXTAREA_MAX_PX = 160;

/**
 * Icono de **nueva conversación** (burbuja con un «+»): decorativo, el nombre accesible lo aporta el
 * botón. A trazo, como el resto de iconos del proyecto.
 */
function NewChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.5 12a8 8 0 0 1-8 8H8l-4.5 2.5V12a8 8 0 0 1 8-8h1" />
      <path d="M18.5 3.5v5M16 6h5" />
    </svg>
  );
}

export interface AssistantChatProps {
  /**
   * `page` = la conversación ocupa la página completa (`/asistente`); `panel` = vive dentro del
   * panel flotante del widget (incremento v4), con el log más bajo para no tapar la pantalla.
   */
  readonly variant?: "page" | "panel";
  /** Navegación a ejecutar cuando la consulta tiene resultado en la página (catálogo filtrado). */
  readonly onPageAction?: (action: AssistantPageAction) => void;
}

/** Panel de chat del asistente IA (CU-08, docs/SRS.md §9): conversación + handoff a firma + estado 08e. */
export function AssistantChat({ variant = "page", onPageAction }: AssistantChatProps = {}) {
  const t = useTranslations("assistant");
  const router = useRouter();
  const { address } = useOnboarding();
  // Sin manejador propio (la página `/asistente`), el resultado se enseña igual navegando a la
  // página que lo contiene: el comportamiento del asistente no depende de dónde esté montado.
  const navigate = useCallback(
    (action: AssistantPageAction) => {
      if (onPageAction) {
        onPageAction(action);
        return;
      }
      router.push(action.href);
    },
    [onPageAction, router],
  );
  const { messages, status, unavailable, canRetry, preparedPurchase, send, retry, startNew } =
    useAssistant(address, t("errorReply"), navigate);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autoscroll al último mensaje cuando cambia el log o el estado (MINOR#28).
  //
  // Se mueve el `scrollTop` **del propio historial**, no con `scrollIntoView`: aquél asciende por
  // todos los ancestros y arrastraba el scroll de la PÁGINA entera. En el widget (panel `position:
  // fixed`, sobre todo en móvil) eso desplazaba la página de fondo y, en la emulación móvil, dejaba
  // el compositor fuera del área visible: el botón de envío no se podía pulsar (reproducido con el
  // viewport de Pixel 5). El historial es el único que debe desplazarse.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, status]);

  // Textarea autoexpandible (UX#16): crece con el contenido hasta un tope, luego hace scroll.
  function autoGrow(el: HTMLTextAreaElement | null): void {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }
  useEffect(() => {
    autoGrow(textareaRef.current);
  }, [input]);

  function submit(): void {
    const text = input;
    if (!text.trim() || status === "loading") return;
    setInput("");
    void send(text);
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    submit();
  }

  // Enter envía; Shift+Enter inserta una nueva línea (UX#16).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  // Chips de sugerencia: rellenan el input y disparan el envío (UX#17).
  function onSuggestion(text: string): void {
    if (status === "loading") return;
    setInput("");
    void send(text);
  }

  const suggestions: readonly string[] = [
    t("suggestions.availability"),
    t("suggestions.myNights"),
    t("suggestions.buy"),
  ];

  return (
    // En el panel (variante `panel`) la conversación ocupa la altura disponible del panel y **solo
    // el historial** hace scroll: el compositor queda anclado abajo. Con un único contenedor con
    // scroll, el botón de envío podía quedar tapado por el historial en móvil (reproducido con el
    // viewport de Pixel 5: el clic nunca llegaba al botón).
    <section className={`flex flex-col gap-4 ${variant === "panel" ? "min-h-0 flex-1" : ""}`}>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={t("logLabel")}
        className={`flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-brand border border-line bg-shell p-4 ${
          variant === "panel" ? "min-h-0 flex-1" : "min-h-[12rem] max-h-[28rem]"
        }`}
      >
        {messages.length === 0 && (
          <>
            <p className="text-ink-soft">{t("intro")}</p>
            {/* Sugerencias iniciales (quick replies) solo antes del primer turno (UX#17). */}
            <div
              data-testid="assistant-suggestions"
              aria-label={t("suggestionsLabel")}
              className="mt-1 flex flex-wrap gap-2"
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  disabled={status === "loading"}
                  className="min-h-touch rounded-pill border border-line bg-mist-2 px-3 py-1 text-small font-medium text-ink transition-colors hover:bg-mist disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <p
            key={i}
            data-testid={`msg-${m.role}`}
            className={
              m.role === "user"
                ? "self-end rounded-brand bg-azure px-3 py-2 text-shell"
                : "self-start rounded-brand bg-mist-2 px-3 py-2 text-ink"
            }
          >
            {m.text}
          </p>
        ))}
        {status === "loading" && (
          <p data-testid="assistant-loading" className="self-start text-ink-soft" role="status">
            {t("sending")}
          </p>
        )}
      </div>

      {unavailable && (
        <div
          data-testid="assistant-unavailable"
          role="alert"
          className="flex flex-col gap-2 rounded-brand border border-line bg-mist-2 px-4 py-4 text-ink"
        >
          <p>{t("unavailable")}</p>
          <div className="flex flex-wrap items-center gap-3">
            {canRetry && (
              <button
                type="button"
                data-testid="assistant-retry"
                onClick={() => void retry()}
                disabled={status === "loading"}
                className="min-h-touch rounded-brand bg-azure px-4 py-2 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60"
              >
                {t("retry")}
              </button>
            )}
            <Link href="/" className="font-semibold text-azure underline">
              {t("manualLink")}
            </Link>
          </div>
        </div>
      )}

      {preparedPurchase && <PurchaseHandoff purchase={preparedPurchase} />}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        {/* Nueva conversación (2026-10-10): borra el hilo y su memoria. Se deshabilita cuando no hay
            nada que borrar o mientras el asistente responde (borrar a medias dejaría un hilo roto). */}
        <button
          type="button"
          data-testid="assistant-new-chat"
          onClick={startNew}
          disabled={messages.length === 0 || status === "loading"}
          title={t("newChat")}
          aria-label={t("newChat")}
          className="inline-flex min-h-touch min-w-touch flex-none items-center justify-center rounded-brand border border-line bg-shell text-ink transition-colors hover:bg-mist-2 disabled:opacity-50"
        >
          <NewChatIcon />
        </button>
        <textarea
          ref={textareaRef}
          data-testid="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          // Teclado móvil afinado (UX#38): «enviar» como acción del intro, y mayúscula/corrección
          // como en un campo de texto natural. `text-base` asegura ≥16px (sin auto-zoom iOS).
          enterKeyHint="send"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          className="min-h-touch flex-1 resize-none rounded-brand border border-line-strong bg-shell px-3 py-2 text-base text-ink"
        />
        <button
          type="submit"
          data-testid="assistant-send"
          disabled={status === "loading" || input.trim().length === 0}
          className="min-h-touch rounded-brand bg-azure px-4 py-2 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60"
        >
          {t("send")}
        </button>
      </form>
    </section>
  );
}
