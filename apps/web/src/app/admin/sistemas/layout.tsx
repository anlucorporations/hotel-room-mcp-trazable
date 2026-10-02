import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminSignInScreen } from "@/components/admin/AdminSignInScreen";
import { currentAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Gate **server-side** de la sección Sistemas (RF-41.1).
 *
 * Oculta Sistemas en la UI no es la seguridad: aquí se verifica la sesión y se exige
 * `DEFAULT_ADMIN_ROLE` **antes** de renderizar cualquier subpágina, con el mismo guard que las
 * APIs. Un operador de recepción recibe la pantalla de acceso denegado, no el panel.
 */
export default async function SistemasLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession();
  if (!session.ok) return <AdminSignInScreen />;

  if (session.session.role !== "DEFAULT_ADMIN_ROLE") {
    const t = await getTranslations("admin");
    return (
      <AdminLayout>
        <section className="flex flex-col gap-3">
          <h1 className="font-display text-h2 font-semibold text-ink">{t("systemsTitle")}</h1>
          <p
            data-testid="systems-denied"
            role="alert"
            className="rounded-brand-lg border border-line bg-mist-2 px-5 py-8 text-ink-soft"
          >
            {t("systemsDenied")}
          </p>
        </section>
      </AdminLayout>
    );
  }

  return <AdminLayout>{children}</AdminLayout>;
}
