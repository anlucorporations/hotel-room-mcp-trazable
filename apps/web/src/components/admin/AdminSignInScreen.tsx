"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { WalletBar } from "@/components/wallet/WalletBar";
import { CredentialForm } from "./CredentialForm";
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
 * Pantalla de acceso del back-office cuando NO hay sesión canónica en servidor (gate RSC en
 * `app/admin/layout.tsx`).
 *
 * D-04: el acceso es usuario + contraseña + TOTP (`CredentialForm`), no SIWE. Al conceder
 * sesión, `router.refresh()` re-evalúa el gate del servidor para servir el contenido. La wallet
 * sigue disponible en la barra superior para firmar las transacciones del back-office, pero ya
 * no autoriza el acceso.
 */
export function AdminSignInScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const session = useAdminSession();

  useEffect(() => {
    if (session.sessionUsername) router.refresh();
  }, [session.sessionUsername, router]);

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
          {session.isLoading ? (
            <p role="status" aria-live="polite" className="text-ink-soft">
              {t("loadingSession")}
            </p>
          ) : (
            <CredentialForm session={session} />
          )}
        </div>
      </main>
    </div>
  );
}
