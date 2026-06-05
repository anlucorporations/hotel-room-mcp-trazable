"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/components/wallet/useOnboarding";
import { useAssistant } from "./useAssistant";
import { PurchaseHandoff } from "./PurchaseHandoff";

/** Panel de chat del asistente IA (CU-08): conversación + handoff a firma + estado 08e. */
export function AssistantChat() {
  const t = useTranslations("assistant");
  const { address } = useOnboarding();
  const { messages, status, unavailable, preparedPurchase, send } = useAssistant(address);
  const [input, setInput] = useState("");

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  }

  return (
    <section className="flex flex-col gap-4">
      <div
        role="log"
        aria-live="polite"
        aria-label={t("logLabel")}
        className="flex min-h-[12rem] flex-col gap-2 rounded-brand border border-line bg-shell p-4"
      >
        {messages.length === 0 && <p className="text-ink-soft">{t("intro")}</p>}
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
      </div>

      {unavailable && (
        <div
          data-testid="assistant-unavailable"
          role="alert"
          className="flex flex-col gap-2 rounded-brand border border-line bg-sand-2 px-4 py-4 text-ink"
        >
          <p>{t("unavailable")}</p>
          <Link href="/" className="self-start font-semibold text-sea underline">
            {t("manualLink")}
          </Link>
        </div>
      )}

      {preparedPurchase && <PurchaseHandoff purchase={preparedPurchase} />}

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          data-testid="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="min-h-touch flex-1 rounded-brand border border-line bg-shell px-3 text-ink"
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
