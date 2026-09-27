import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout/PublicShell";

export const dynamic = "force-dynamic";

/**
 * Layout de la ruta de personal `/housekeeping` (F3 · D-62).
 *
 * Fuera de las tres suites: es la pantalla del personal de limpieza, pensada para el móvil y con
 * vista simplificada. Reutiliza `PublicShell` para conservar marca y pie, sin anadir navegacion de
 * suites que el rol HOUSEKEEPING no necesita.
 */
export default function HousekeepingLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8">{children}</div>
    </PublicShell>
  );
}
