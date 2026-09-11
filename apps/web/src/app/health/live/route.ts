import { NextResponse } from "next/server";
import { checkLiveness } from "@hotel/shared";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const res = await checkLiveness();
  return NextResponse.json(res, { status: 200 });
}
