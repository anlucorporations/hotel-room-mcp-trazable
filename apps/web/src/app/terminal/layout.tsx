import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { PublicShell } from "@/components/layout/PublicShell";
import { readTerminalSessionFromCookieHeader } from "@/lib/terminal-session-server";
import { TerminalLogin } from "@/components/terminal/TerminalLogin";

export const dynamic = "force-dynamic";

/**
 * Puerta del **terminal de mantenimiento** (F5 · T5.1).
 *
 * Sin sesión de terminal válida solo se sirve el login por PIN; nunca se renderiza el tablero de
 * tareas ni datos de habitaciones. La sesión es independiente del back-office (el técnico no tiene
 * wallet ni usuario de administración).
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const cookieHeader = cookies().toString();
  const session = await readTerminalSessionFromCookieHeader(cookieHeader);
  if (!session.ok) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <TerminalLogin />
        </div>
      </PublicShell>
    );
  }
  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-6">{children}</div>
    </PublicShell>
  );
}
