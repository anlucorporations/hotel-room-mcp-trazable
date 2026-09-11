import { NextResponse } from "next/server";
import { checkReadiness } from "@hotel/shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await checkReadiness();
  const statusCode = result.status === "READY" ? 200 : 503;
  return NextResponse.json(result, { status: statusCode });
}
