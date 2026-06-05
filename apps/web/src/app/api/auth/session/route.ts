import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Devuelve la sesión actual del back-office (dirección + roles), o `null`/`[]` si no hay. */
export function GET(): NextResponse {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  return NextResponse.json({
    address: session?.address ?? null,
    roles: session?.roles ?? [],
  });
}
