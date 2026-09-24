import "server-only";
import { cookies } from "next/headers";
import { authorize, type GuardResult } from "@/lib/guard";

/**
 * Sesión del back-office verificada **en el render** de un Server Component (M7 · H1).
 *
 * Motivo: `app/admin/layout.tsx` solo miraba si la cookie existía, y en el App Router el árbol de
 * la página se renderiza igualmente (el layout decide si lo pinta o no). Con el build real, un
 * cliente **sin cookies** recibía HTTP 200 con el payload de agregados del dashboard dentro del
 * flujo RSC, mientras `/api/admin/metrics` respondía 401. Es decir: las **acciones** estaban
 * cerradas por el guard de las rutas de API, pero la **lectura** del panel no.
 *
 * Aquí se verifica el token de verdad (firma, caducidad y blocklist de Redis) antes de que el
 * componente de página lea nada. Falla en cerrado: si no se puede verificar (Redis caído, secreto
 * ausente), no se sirve el panel.
 */
export async function currentAdminSession(): Promise<GuardResult> {
  const cookieHeader = cookies().toString();
  if (cookieHeader.length === 0) {
    return { ok: false, reason: "unauthorized", message: "Sin cookies de sesión." };
  }
  return authorize(
    new Request("http://back-office.interno/", { headers: { cookie: cookieHeader } }),
  );
}
