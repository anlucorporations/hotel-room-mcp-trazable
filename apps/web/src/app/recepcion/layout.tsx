import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout/PublicShell";
import { FrontOfficeShell } from "@/components/reception/FrontOfficeShell";

export const dynamic = "force-dynamic";

/**
 * Layout de la Suite Front Office (F2 · D-32). Conserva `/recepcion` como raíz y anida las
 * funciones de la suite; la barra superior vive en `FrontOfficeShell`.
 */
export default function ReceptionLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8">
        <FrontOfficeShell>{children}</FrontOfficeShell>
      </div>
    </PublicShell>
  );
}
