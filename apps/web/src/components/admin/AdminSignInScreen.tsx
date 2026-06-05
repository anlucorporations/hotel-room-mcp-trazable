"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useAdminSession } from "./useAdminSession";

/** Marca circular (coherente con el resto del back-office). */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="h-[30px] w-[30px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]"
      style={{
        background:
          "radial-gradient(circle at 32% 30%, var(--gold), var(--terracotta) 55%, var(--sea) 130%)",
      }}
    />
  );
}

/**
 * Pantalla de acceso del back-office cuando NO hay sesión verificada en servidor (gate RSC en
 * `app/admin/layout.tsx`). El login SIWE es client-side (requiere firma de la wallet); al
 * conceder sesión, `router.refresh()` re-evalúa el gate del servidor para servir el contenido.
 * Mientras no haya sesión, el servidor nunca renderiza los paneles del back-office.
 */
export function AdminSignInScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const session = useAdminSession();
  const { onboarding, isSigningIn, signInError, sessionAddress } = session;

  // Tras conceder sesión (cookie puesta por /api/auth/verify), refresca para que el layout
  // RSC vuelva a comprobar la cookie y renderice el back-office.
  useEffect(() => {
    if (sessionAddress) router.refresh();
  }, [sessionAddress, router]);

  const action =
    "min-h-touch rounded-pill bg-sea px-5 font-semibold text-shell transition-colors hover:bg-sea-deep disabled:opacity-60";

  return (
    <div className="flex min-h-screen flex-col bg-sand">
      <header className="sticky top-0 z-40 border-b border-line bg-sand/85 backdrop-blur">
        <div className="mx-auto flex min-h-[64px] w-full max-w-6xl items-center gap-3 px-5 py-2">
          <span className="flex items-center gap-3 font-display text-[19px] font-semibold leading-none tracking-tight text-ink">
            <BrandMark />
            {t("brandTitle")}
          </span>
          <div className="ml-auto">
            <WalletBar />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start px-5 py-10">
        <div className="mx-auto flex max-w-md flex-col items-start gap-4 rounded-brand-lg border border-line bg-shell p-6 shadow-card">
          <h1 className="font-display text-h3 font-semibold text-ink">{t("gateTitle")}</h1>
          {!onboarding.isConnected ? (
            <>
              <p className="text-ink-soft">{t("connectPrompt")}</p>
              <button type="button" onClick={onboarding.connect} className={action}>
                {t("connect")}
              </button>
            </>
          ) : onboarding.isWrongNetwork ? (
            <>
              <p data-testid="wrong-network" role="alert" className="text-terracotta-text">
                {t("wrongNetwork")}
              </p>
              <button type="button" onClick={onboarding.switchToAppChain} className={action}>
                {t("switchNetwork")}
              </button>
            </>
          ) : (
            <>
              <p className="text-ink-soft">{t("signInPrompt")}</p>
              <button
                type="button"
                data-testid="admin-sign-in"
                onClick={() => void session.signIn()}
                disabled={isSigningIn}
                aria-busy={isSigningIn}
                className={action}
              >
                {isSigningIn ? t("signingIn") : t("signIn")}
              </button>
              {/* Estado de la firma anunciado a lectores de pantalla (MINOR#37). */}
              <p role="status" aria-live="polite" className="sr-only">
                {isSigningIn ? t("signingIn") : ""}
              </p>
              {signInError && (
                <p data-testid="auth-error" role="alert" className="text-terracotta-text">
                  {signInError === "noRole" ? t("noRole") : t("signInFailed")}
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
