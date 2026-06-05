"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAssistant } from "./useAssistant";
import { PurchaseHandoff } from "./PurchaseHandoff";

/** Panel de chat del asistente IA (CU-08): conversación + handoff a firma + estado 08e. */
export function AssistantChat() {
  const t = useTranslations("assistant");
  const { messages, status, unavailable, preparedPurchase, send } = useAssistant();
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
        className="flex min-h-[12rem] flex-col gap-2 rounded-md border border-slate-200 p-4"
      >
        {messages.length === 0 && <p className="text-slate-500">{t("intro")}</p>}
        {messages.map((m, i) => (
          <p
            key={i}
            data-testid={`msg-${m.role}`}
            className={m.role === "user" ? "self-end rounded-md bg-sky-100 px-3 py-2" : "self-start rounded-md bg-slate-100 px-3 py-2"}
          >
            {m.text}
          </p>
        ))}
        {status === "loading" && (
          <p data-testid="assistant-loading" className="self-start text-slate-500" role="status">
            {t("sending")}
          </p>
        )}
      </div>

      {unavailable && (
        <div
          data-testid="assistant-unavailable"
          role="alert"
          className="flex flex-col gap-2 rounded-md bg-amber-50 px-4 py-4 text-amber-800"
        >
          <p>{t("unavailable")}</p>
          <Link href="/" className="self-start font-semibold underline">
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
          className="min-h-touch flex-1 rounded-md border border-slate-300 px-3"
        />
        <button
          type="submit"
          data-testid="assistant-send"
          disabled={status === "loading" || input.trim().length === 0}
          className="min-h-touch rounded-md bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {t("send")}
        </button>
      </form>
    </section>
  );
}
