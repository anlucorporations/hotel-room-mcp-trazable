import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout/PublicShell";

export const dynamic = "force-dynamic";

/**
 * Layout de la ruta de personal `/mantenimiento` (F4 · D-63).
 *
 * Fuera de las suites, análoga a `/housekeeping`: pantalla del técnico, pensada para el móvil y con
 * vista simplificada. Solo cambia el contenido; marca y pie vienen de `PublicShell`.
 */
export default function MaintenanceLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">{children}</div>
    </PublicShell>
  );
}
