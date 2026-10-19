"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PinPad } from "./PinPad";

/** Login del terminal (F5 · T5.1): PIN + obligación de rotación en el primer uso/caducidad. */
export function TerminalLogin() {
  const t = useTranslations("terminal");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustChangePin, setMustChangePin] = useState(false);

  async function login(username: string, pin: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? t("loginError"));
      if (data?.mustChangePin === true) {
        setMustChangePin(true);
        return;
      }
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("loginError"));
    } finally {
      setBusy(false);
    }
  }

  if (mustChangePin) return <ChangePinForm onDone={() => { setMustChangePin(false); router.refresh(); }} />;
  return <PinPad onSubmit={(operator, pin) => void login(operator, pin)} error={error} busy={busy} />;
}

/** Rotación de PIN (primer uso, caducidad o petición). */
export function ChangePinForm({ onDone }: { readonly onDone: () => void }) {
  const t = useTranslations("terminal");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/auth/change-pin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: pin }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ?? t("changePinError"));
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t("changePinError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-2 rounded-brand border border-line px-4 py-5" data-testid="terminal-change-pin">
      <h1 className="text-h3 font-semibold text-ink">{t("changePinTitle")}</h1>
      <p className="text-small text-ink-soft">{t("changePinHint")}</p>
      <input
        className="min-h-touch rounded-brand-sm border border-line-strong bg-shell px-3 text-small tracking-[0.3em] text-ink"
        inputMode="numeric"
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
      />
      {error !== null && <p role="alert" className="text-small text-error">{error}</p>}
      <button type="button" disabled={busy || pin.length < 4} onClick={() => void submit()} className="min-h-touch rounded-pill bg-azure px-4 text-small font-semibold text-shell disabled:opacity-60">
        {t("changePinSubmit")}
      </button>
    </section>
  );
}

/** Aviso de pérdida de conexión: sin red el terminal **no permite escribir** (RNF-M-18/D-C30). */
export function OfflineNotice() {
  const t = useTranslations("terminal");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = (): void => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <p role="alert" data-testid="terminal-offline" className="rounded-brand-sm bg-mist-2 px-3 py-2 text-small text-error">
      {t("offline")}
    </p>
  );
}
