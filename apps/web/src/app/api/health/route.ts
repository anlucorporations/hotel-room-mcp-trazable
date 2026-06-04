import { NextResponse } from "next/server";

/** Liveness de la web/api-route (RNF-17). No expone datos sensibles. */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", service: "web" });
}
