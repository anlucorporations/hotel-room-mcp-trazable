"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AdminCard } from "@/components/admin/AdminPanel";
import { useAdminContext } from "@/components/admin/AdminLayout";
import { MODAL_PRIMARY, MODAL_SECONDARY, ModalShell } from "@/components/ui/ModalShell";

const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";
const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const GHOST =
  "min-h-touch rounded-pill border border-line px-4 font-semibold text-ink transition-colors hover:bg-mist-2";

interface MfaSetup {
  readonly uri: string;
  readonly secret: string;
  readonly recoveryCodes: readonly string[];
}

/**
 * Seguridad y mis datos (RF-46, CU-46): el operador autenticado rota su MFA y cambia su contraseña.
 * Actúa siempre sobre la **propia** cuenta (`/api/auth/*` usa el usuario del token).
 */
export function AdminSecurity() {
  const t = useTranslations("system");
  const { apiFetch, sessionUsername } = useAdminContext();

  const [mfa, setMfa] = useState<MfaSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /** Ficha flotante del cambio de contraseña. */
  const [passwordOpen, setPasswordOpen] = useState(false);
  const tCommon = useTranslations("common");

  async function rotateMfa(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    setMfa(null);
    try {
      const res = await apiFetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("securityRotateError"));
      setMfa(data);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("securityRotateError"));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("passwordError"));
      setMessage(t("passwordChanged"));
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("passwordError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyMfa(): Promise<void> {
    if (!mfa) return;
    try {
      await navigator.clipboard.writeText(
        [`${t("secretLabel")}: ${mfa.secret}`, `${t("uriLabel")}: ${mfa.uri}`, `${t("recoveryLabel")}: ${mfa.recoveryCodes.join(" ")}`].join("\n"),
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {sessionUsername && (
        <p className="text-small text-ink-soft">{t("securityFor", { username: sessionUsername })}</p>
      )}

      {error && (
        <p role="alert" data-testid="security-error" className="rounded-brand border border-coral-text/40 bg-mist-2 px-4 py-3 text-small text-coral-text">
          {error}
        </p>
      )}
      {message && (
        <p role="status" data-testid="security-message" className="rounded-brand border border-success/40 bg-success-bg px-4 py-3 text-small text-ink">
          {message}
        </p>
      )}

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold">{t("securityMfaTitle")}</h2>
        <p className="mt-1 text-small text-ink-soft">{t("securityMfaHint")}</p>
        <button type="button" onClick={() => void rotateMfa()} disabled={busy} data-testid="rotate-mfa" className={`mt-3 ${ACTION}`}>
          {busy ? t("processing") : t("securityRotate")}
        </button>

        {mfa && (
          <div data-testid="mfa-credentials" className="mt-4 rounded-brand border border-success/40 bg-success-bg p-4">
            <p className="text-small text-ink-soft">{t("securityOnceHint")}</p>
            <dl className="mt-2 grid gap-2 text-small">
              <div><dt className="text-ink-soft">{t("secretLabel")}</dt><dd className="font-mono break-all">{mfa.secret}</dd></div>
              <div><dt className="text-ink-soft">{t("uriLabel")}</dt><dd className="font-mono break-all">{mfa.uri}</dd></div>
              <div><dt className="text-ink-soft">{t("recoveryLabel")}</dt><dd className="font-mono break-all">{mfa.recoveryCodes.join(" ")}</dd></div>
            </dl>
            <button type="button" onClick={() => void copyMfa()} data-testid="copy-mfa" className={`mt-3 ${GHOST}`}>
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="font-display text-h3 font-semibold">{t("securityPasswordTitle")}</h2>
        <p className="mt-1 text-small text-ink-soft">{t("securityPasswordHint")}</p>
        <button
          type="button"
          data-testid="open-change-password"
          onClick={() => setPasswordOpen(true)}
          className={`mt-3 ${ACTION}`}
        >
          {t("passwordSubmit")}
        </button>
      </AdminCard>

      {passwordOpen && (
        <ModalShell
          testId="change-password-dialog"
          title={t("securityPasswordTitle")}
          subtitle={t("securityPasswordHint")}
          closeLabel={tCommon("close")}
          onClose={() => setPasswordOpen(false)}
          footerTestId="change-password-footer"
          footer={
            <>
              <button type="button" onClick={() => setPasswordOpen(false)} className={MODAL_SECONDARY}>
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                form="change-password-form"
                disabled={busy}
                data-testid="change-password"
                className={MODAL_PRIMARY}
              >
                {busy ? t("processing") : t("passwordSubmit")}
              </button>
            </>
          }
        >
          <form id="change-password-form" onSubmit={changePassword} className="grid gap-3 tablet:grid-cols-3">
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("currentPasswordLabel")}
              <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} data-testid="current-password" className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("newPasswordLabel")}
              <input type="password" required autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} data-testid="new-password" className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-small text-ink">
              {t("confirmPasswordLabel")}
              <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} data-testid="confirm-password" className={FIELD} />
            </label>
          </form>
        </ModalShell>
      )}

    </div>
  );
}
