import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid
 *
 * Devuelve la clave **pública** VAPID que el navegador necesita para suscribirse a Web Push
 * (RF-37). La clave pública es pública por definición; la privada nunca sale del servidor.
 *
 * 200 `{ publicKey }` · 503 `{ publicKey: null }` si el push no está configurado.
 */
export async function GET(): Promise<NextResponse> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { publicKey: null, message: "Las notificaciones push no están configuradas." },
      { status: 503 },
    );
  }
  return NextResponse.json({ publicKey });
}
