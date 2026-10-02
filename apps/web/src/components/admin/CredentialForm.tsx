"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminSession } from "./useAdminSession";

const ACTION =
  "min-h-touch rounded-pill bg-azure px-5 font-semibold text-shell transition-colors hover:bg-azure-deep disabled:opacity-60";
const FIELD =
  "min-h-touch w-full rounded-brand border border-line-strong bg-shell px-3 text-ink outline-none focus:border-azure";

/**
 * Formulario de acceso canónico (D-04) en dos pasos.
 *
 *   Paso 1 «credentials»: usuario + contraseña → `POST /api/auth/login` (reto MFA).
 *   Paso 2 «mfa»:        código TOTP de 6 dígitos o código de rescate → `POST /api/auth/mfa/verify`.
 *
 * No hay firma de wallet: la autenticación es usuario + contraseña + TOTP. Los tokens quedan en
 * cookies HttpOnly puestas por el servidor.
 */
export function CredentialForm({ session }: { session: AdminSession }) {
  const t = useTranslations("admin");
  const { authStep, authError, isSigningIn, recoveryRemaining } = session;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  const errorKey =
    authError === "invalidCredentials"
      ? "authInvalidCredentials"
      : authError === "mfaInvalid"
        ? "authMfaInvalid"
        : authError === "locked"
          ? "authLocked"
          : authError === "rateLimited"
            ? "authRateLimited"
            : authError === "expired"
              ? "authExpired"
              : authError === "failed"
                ? "authFailed"
                : null;

  if (authStep === "mfa") {
    const code = useRecovery ? recoveryCode : totpCode;
    return (
      <form
        className="flex w-full flex-col items-start gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void session.verifyMfa(
            useRecovery ? { recoveryCode: recoveryCode.trim() } : { totpCode: totpCode.trim() },
          );
        }}
      >
        <p className="text-ink-soft">{t("mfaPrompt")}</p>

        <label className="flex w-full flex-col gap-1 text-small text-ink">
          {useRecovery ? t("recoveryCodeLabel") : t("totpCodeLabel")}
          <input
            data-testid={useRecovery ? "admin-recovery-code" : "admin-totp-code"}
            className={FIELD}
            value={code}
            onChange={(event) =>
              useRecovery ? setRecoveryCode(event.target.value) : setTotpCode(event.target.value)
            }
            inputMode={useRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={useRecovery ? 10 : 6}
            required
            autoFocus
          />
        </label>

        <button type="submit" data-testid="admin-mfa-verify" disabled={isSigningIn} aria-busy={isSigningIn} className={ACTION}>
          {isSigningIn ? t("signingIn") : t("mfaVerify")}
        </button>
        <button
          type="button"
          data-testid="admin-mfa-alt"
          onClick={() => {
            setUseRecovery((value) => !value);
            session.resetAuth();
          }}
          className="text-small font-medium text-azure-deep underline"
        >
          {useRecovery ? t("useTotpInstead") : t("useRecoveryInstead")}
        </button>

        {recoveryRemaining !== null && (
          <p data-testid="admin-recovery-remaining" className="text-small text-ink-soft">
            {t("recoveryRemaining", { count: recoveryRemaining })}
          </p>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {isSigningIn ? t("signingIn") : ""}
        </p>
        {errorKey && (
          <p data-testid="auth-error" role="alert" className="text-coral-text">
            {t(errorKey)}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      className="flex w-full flex-col items-start gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void session.submitCredentials(username.trim(), password);
      }}
    >
      <p className="text-ink-soft">{t("signInPrompt")}</p>

      <label className="flex w-full flex-col gap-1 text-small text-ink">
        {t("usernameLabel")}
        <input
          data-testid="admin-username"
          className={FIELD}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
          autoFocus
        />
      </label>

      <label className="flex w-full flex-col gap-1 text-small text-ink">
        {t("passwordLabel")}
        <input
          data-testid="admin-password"
          type="password"
          className={FIELD}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <button
        type="submit"
        data-testid="admin-sign-in"
        disabled={isSigningIn}
        aria-busy={isSigningIn}
        className={ACTION}
      >
        {isSigningIn ? t("signingIn") : t("signIn")}
      </button>

      <p role="status" aria-live="polite" className="sr-only">
        {isSigningIn ? t("signingIn") : ""}
      </p>
      {errorKey && (
        <p data-testid="auth-error" role="alert" className="text-coral-text">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}
