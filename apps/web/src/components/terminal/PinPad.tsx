"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const FIELD =
  "min-h-touch w-full rounded-brand-sm border border-line-strong bg-shell px-3 text-small text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-azure";
const BUTTON =
  "min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";

/** Teclado táctil del PIN (F5 · T5.2): 4–6 dígitos, sin inputs diminutos. */
export function PinPad({
  onSubmit,
  error,
  busy,
}: {
  readonly onSubmit: (username: string, pin: string) => void;
  readonly error: string | null;
  readonly busy: boolean;
}) {
  const t = useTranslations("terminal");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  function press(digit: string): void {
    setPin((current) => (current.length >= 6 ? current : current + digit));
  }

  return (
    <section
      className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-brand border border-line px-4 py-5"
      data-testid="terminal-pin"
    >
      <h1 className="text-h3 font-semibold text-ink">{t("loginTitle")}</h1>
      <p className="text-small text-ink-soft">{t("loginHint")}</p>
      <label className="flex flex-col gap-1 text-small text-ink">
        {t("operator")}
        <input className={FIELD} autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <div aria-label={t("pinLabel")} className="grid grid-cols-3 gap-2" role="group">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" className="min-h-14 rounded-brand-sm border border-line bg-mist-2 text-h4 text-ink" onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" className="min-h-14 rounded-brand-sm border border-line bg-mist-2 text-small text-ink" onClick={() => setPin("")}>
          {t("clear")}
        </button>
        <button type="button" className="min-h-14 rounded-brand-sm border border-line bg-mist-2 text-h4 text-ink" onClick={() => press("0")}>
          0
        </button>
        <button type="button" className="min-h-14 rounded-brand-sm border border-line bg-mist-2 text-small text-ink" onClick={() => setPin((current) => current.slice(0, -1))}>
          {t("backspace")}
        </button>
      </div>
      <p aria-live="polite" className="text-center text-small tracking-[0.4em] text-ink" data-testid="terminal-pin-dots">
        {pin.replace(/\d/g, "•") || "—"}
      </p>
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      <button type="button" className={BUTTON} disabled={busy || username.trim().length === 0 || pin.length < 4} onClick={() => onSubmit(username.trim(), pin)}>
        {t("enter")}
      </button>
    </section>
  );
}
