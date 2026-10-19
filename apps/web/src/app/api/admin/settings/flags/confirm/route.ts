import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  OperationsRepository,
  actionTypeHash,
  entityIdOf,
  operationsDomain,
  operationsDomainSeparator,
  recoverOperationalSigner,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { activeChain } from "@/config/chain";

export const dynamic = "force-dynamic";

const operationsRepo = new OperationsRepository();

function operationsAddress(): `0x${string}` | null {
  const value = process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS;
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as `0x${string}`) : null;
}

/**
 * POST /api/admin/settings/flags/confirm — confirma la firma `CONFIG` de un cambio de flag (F9 · T9.3).
 *
 * El Owner firma el TypedData devuelto por `POST /api/admin/settings/flags` con su wallet de
 * administración; aquí se recupera el firmante, se comprueba que coincide y se marca la firma
 * `SIGNED` para que el `PATCH` de flags pueda aplicarla (D-C22).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const contract = operationsAddress();
  if (!contract) {
    return NextResponse.json({ error: "OPERATIONS_NOT_CONFIGURED", message: "Contrato no configurado." }, { status: 503 });
  }
  let body: { signatureId?: unknown; signature?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  if (typeof body.signatureId !== "string" || typeof body.signature !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", message: "signatureId y signature son obligatorios." }, { status: 400 });
  }
  const record = await operationsRepo.findById(body.signatureId);
  if (!record || record.entityType !== "CONFIG") {
    return NextResponse.json({ error: "SIGNATURE_NOT_FOUND", message: "La firma CONFIG no existe." }, { status: 404 });
  }
  if (record.status !== "PENDING") {
    return NextResponse.json({ error: "SIGNATURE_NOT_READY", message: `La firma está en ${record.status}.` }, { status: 409 });
  }
  const domain = operationsDomain(activeChain.id, contract);
  const message = {
    actionType: actionTypeHash("CONFIG"),
    entityId: entityIdOf("CONFIG", record.entityId),
    payloadHash: record.contentHash as `0x${string}`,
    nonce: record.nonce as `0x${string}`,
    deadline: BigInt(Math.floor((record.deadline as Date).getTime() / 1_000)),
  };
  const recovered = await recoverOperationalSigner(domain, message, body.signature as `0x${string}`);
  if (recovered.toLowerCase() !== record.signerAddress.toLowerCase()) {
    return NextResponse.json({ error: "SIGNER_MISMATCH", message: "La firma no corresponde a la wallet de administración." }, { status: 409 });
  }
  const signed = await operationsRepo.markSigned(record.id, {
    signature: body.signature,
    recoveredSigner: recovered,
    domainHash: operationsDomainSeparator(activeChain.id, contract),
    roleSnapshot: "DEFAULT_ADMIN_ROLE",
  });
  return NextResponse.json({ signature: signed });
}
