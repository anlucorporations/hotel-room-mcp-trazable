"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { useAssistant } from "./useAssistant";
import { PurchaseHandoff } from "./PurchaseHandoff";

/** Altura máxima (px) del `<textarea>` autoexpandible antes de mostrar scroll interno (UX#16). */
const TEXTAREA_MAX_PX = 160;

/** Panel de chat del asistente IA (CU-08): conversación + handoff a firma + estado 08e. */
export function AssistantChat() {
  const t = useTranslations("assistant");
  const { address } = useOnboarding();
  const { messages, status, unavailable, canRetry, preparedPurchase, send, retry } = useAssistant(
    address,
    t("errorReply"),
  );
  const [input, setInput] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autoscroll al último mensaje cuando cambia el log o el estado (MINOR#28).
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
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
    <section className="flex flex-col gap-4">
      <div
        role="log"
        aria-live="polite"
        aria-label={t("logLabel")}
        className="flex max-h-[28rem] min-h-[12rem] flex-col gap-2 overflow-y-auto overscroll-contain rounded-brand border border-line bg-shell p-4"
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
                  className="min-h-touch rounded-pill border border-line bg-sand-2 px-3 py-1 text-small font-medium text-ink transition-colors hover:bg-sand disabled:opacity-60"
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
                ? "self-end rounded-brand bg-sea px-3 py-2 text-shell"
                : "self-start rounded-brand bg-sand-2 px-3 py-2 text-ink"
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
        {/* Ancla del autoscroll: siempre al final del log. */}
        <div ref={logEndRef} aria-hidden="true" />
      </div>

      {unavailable && (
        <div
          data-testid="assistant-unavailable"
          role="alert"
          className="flex flex-col gap-2 rounded-brand border border-line bg-sand-2 px-4 py-4 text-ink"
        >
          <p>{t("unavailable")}</p>
          <div className="flex flex-wrap items-center gap-3">
            {canRetry && (
              <button
                type="button"
                data-testid="assistant-retry"
                onClick={() => void retry()}
                disabled={status === "loading"}
                className="min-h-touch rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60"
              >
                {t("retry")}
              </button>
            )}
            <Link href="/" className="font-semibold text-sea underline">
              {t("manualLink")}
            </Link>
          </div>
        </div>
      )}

      {preparedPurchase && <PurchaseHandoff purchase={preparedPurchase} />}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          data-testid="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="min-h-touch flex-1 resize-none rounded-brand border border-line bg-shell px-3 py-2 text-ink"
        />
        <button
          type="submit"
          data-testid="assistant-send"
          disabled={status === "loading" || input.trim().length === 0}
          className="min-h-touch rounded-brand bg-sea px-4 py-2 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60"
        >
          {t("send")}
        </button>
      </form>
    </section>
  );
}
