import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { confirmMaintenanceSignature } from "@/lib/mantenimiento/signatures";
import { signatureErrorResponse } from "@/lib/mantenimiento/errors";
import { requireRole } from "@/lib/guard";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/mantenimiento/signatures/[id] — confirma la firma EIP-712 (F4 · T4.5).
 *
 * Cuerpo: `{ signature: "0x…" }`. Recupera el firmante con viem y comprueba que es la wallet activa
 * asignada al jefe; después marca la fila `SIGNED` (el worker la anclará con el relayer, F3).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const auth = await requireRole(request, ["HEAD_MAINTENANCE", "HEAD_KEEPER", "DEFAULT_ADMIN_ROLE"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: { signature?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signature debe ser 0x + 130 hex." }, { status: 400 });
  }

  try {
    const signed = await confirmMaintenanceSignature({
      signatureId: id,
      signature: body.signature as `0x${string}`,
    });
    return NextResponse.json({ signature: signed });
  } catch (error: unknown) {
    return signatureErrorResponse(error, "[API /api/mantenimiento/signatures/[id]] PATCH");
  }
}
