import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ReceptionRepository } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { receptionErrorResponse } from "@/lib/reception-errors";

export const dynamic = "force-dynamic";

const repo = new ReceptionRepository();

/**
 * GET /api/reception/charges?tokenId=…
 *
 * Cargos adicionales de una estancia (RF-35, CU-35). La sección de check-out los lista para poder
 * cancelarlos. Protegido: `RECEPTION_ROLE` o owner.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  const tokenId = request.nextUrl.searchParams.get("tokenId");
  if (!tokenId) {
    return NextResponse.json(
      { error: "CARGO_INVALIDO", message: "Falta el tokenId de la estancia." },
      { status: 400 },
    );
  }

  try {
    const charges = await repo.listCharges(tokenId);
    return NextResponse.json({ tokenId, charges });
  } catch (error: unknown) {
    return receptionErrorResponse("charges", error);
  }
}

/**
 * POST /api/reception/charges
 *
 * Alta de un cargo adicional por recepción (D-34, RF-35). Body JSON:
 * `{ tokenId, concept, amountCents, currency? }`. El autor queda registrado (RNF-33).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "RECEPTION_ROLE");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => null)) as {
      tokenId?: unknown;
      concept?: unknown;
      amountCents?: unknown;
      currency?: unknown;
    } | null;

    if (!body || typeof body.tokenId !== "string" || typeof body.concept !== "string") {
      return NextResponse.json(
        { error: "CARGO_INVALIDO", message: "tokenId y concept son obligatorios." },
        { status: 400 },
      );
    }
    if (typeof body.amountCents !== "number" || !Number.isInteger(body.amountCents)) {
      return NextResponse.json(
        { error: "CARGO_INVALIDO", message: "amountCents debe ser un entero en céntimos." },
        { status: 400 },
      );
    }

    const charge = await repo.createCharge({
      tokenId: body.tokenId,
      concept: body.concept,
      amountCents: body.amountCents,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      createdBy: auth.session.username,
    });
    return NextResponse.json({ charge }, { status: 201 });
  } catch (error: unknown) {
    return receptionErrorResponse("charges", error);
  }
}
