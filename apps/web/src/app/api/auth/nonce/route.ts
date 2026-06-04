import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/nonce-store";

export const dynamic = "force-dynamic";

/** Emite un nonce SIWE de un solo uso (CU-01). */
export function GET(): NextResponse {
  return NextResponse.json({ nonce: issueNonce() });
}
