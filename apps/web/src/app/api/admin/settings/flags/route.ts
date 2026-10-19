import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AuthService,
  OPERATIONAL_FLAGS,
  OperationsRepository,
  SettingsRepository,
  UsersRepository,
  actionTypeHash,
  effectiveFlagValue,
  entityIdOf,
  operationalTypedData,
  operationsDomain,
  parseFlagValue,
  payloadHashOf,
  requiresConfigSignature,
} from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import { activeChain } from "@/config/chain";

export const dynamic = "force-dynamic";

const settingsRepo = new SettingsRepository();
const operationsRepo = new OperationsRepository();
const usersRepo = new UsersRepository();
const authService = new AuthService();

function operationsAddress(): `0x${string}` | null {
  const value = process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS;
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as `0x${string}`) : null;
}

/**
 * GET /api/admin/settings/flags — flags operativos y su valor efectivo (solo owner).
 * POST — **prepara** la firma `CONFIG` para cambiar un flag obligatorio (D-C22).
 * PATCH — aplica el flag con TOTP; desactivar un flag obligatorio exige `signatureId` CONFIG `SIGNED`.
 *
 * La gobernanza es de dos pasos para los flags obligatorios: el Owner firma la acción `CONFIG` con la
 * wallet de administración y solo después el cambio se persiste; el resto de flags solo exigen TOTP.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  const flags = await Promise.all(
    OPERATIONAL_FLAGS.map(async (flag) => ({
      key: flag.key,
      label: flag.label,
      description: flag.description,
      mandatory: flag.mandatory,
      value: effectiveFlagValue(flag.key, await settingsRepo.get(flag.key)),
    })),
  );
  return NextResponse.json({ flags });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  if (!operationsAddress()) {
    return NextResponse.json(
      { error: "OPERATIONS_NOT_CONFIGURED", message: "El contrato de operaciones no está configurado." },
      { status: 503 },
    );
  }
  let body: { key?: unknown; value?: unknown; signerAddress?: unknown; totpCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const flag = OPERATIONAL_FLAGS.find((item) => item.key === body.key);
  const value = parseFlagValue(body.value);
  const signerAddress = typeof body.signerAddress === "string" ? body.signerAddress : "";
  if (!flag || value === null || !/^0x[0-9a-fA-F]{40}$/.test(signerAddress) || typeof body.totpCode !== "string") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "key, value, signerAddress y totpCode son obligatorios." },
      { status: 400 },
    );
  }
  const user = await usersRepo.findByUsername(auth.session.username);
  if (!user || !authService.verifyUserTotp(user, body.totpCode)) {
    return NextResponse.json({ error: "INVALID_TOTP", message: "Código TOTP incorrecto." }, { status: 401 });
  }
  const payload = { key: flag.key, value };
  const contentHash = payloadHashOf("CONFIG", payload);
  const record = await operationsRepo.createSignatureRequest({
    entityType: "CONFIG",
    entityId: crypto.randomUUID(),
    eventName: "configChanged",
    contentHash,
    signerAddress,
    deadline: new Date(Date.now() + 10 * 60_000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  });
  const contract = operationsAddress() as `0x${string}`;
  const domain = operationsDomain(activeChain.id, contract);
  const message = {
    actionType: actionTypeHash("CONFIG"),
    entityId: entityIdOf("CONFIG", record.entityId),
    payloadHash: record.contentHash as `0x${string}`,
    nonce: record.nonce as `0x${string}`,
    deadline: BigInt(Math.floor((record.deadline as Date).getTime() / 1_000)),
  };
  return NextResponse.json({
    signatureId: record.id,
    contentHash,
    roleSnapshot: "DEFAULT_ADMIN_ROLE",
    typedData: {
      domain: { ...domain },
      types: operationalTypedData(domain, message).types,
      primaryType: "OperationalAction",
      message: {
        actionType: message.actionType,
        entityId: message.entityId,
        payloadHash: message.payloadHash,
        nonce: message.nonce,
        deadline: message.deadline.toString(),
      },
    },
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { key?: unknown; value?: unknown; totpCode?: unknown; signatureId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const flag = OPERATIONAL_FLAGS.find((item) => item.key === body.key);
  const value = parseFlagValue(body.value);
  if (!flag || value === null || typeof body.totpCode !== "string") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "key, value y totpCode son obligatorios." },
      { status: 400 },
    );
  }
  const user = await usersRepo.findByUsername(auth.session.username);
  if (!user || !authService.verifyUserTotp(user, body.totpCode)) {
    return NextResponse.json({ error: "INVALID_TOTP", message: "Código TOTP incorrecto." }, { status: 401 });
  }
  const current = effectiveFlagValue(flag.key, await settingsRepo.get(flag.key)) ?? flag.defaultValue;
  const needsSignature = requiresConfigSignature(flag.key, current, value);
  if (needsSignature) {
    if (typeof body.signatureId !== "string") {
      return NextResponse.json(
        {
          error: "CONFIG_SIGNATURE_REQUIRED",
          message: "Desactivar un flag obligatorio exige firma on-chain de la acción CONFIG (D-C22).",
        },
        { status: 409 },
      );
    }
    const signature = await operationsRepo.findById(body.signatureId);
    const expected = payloadHashOf("CONFIG", { key: flag.key, value });
    if (
      !signature ||
      signature.entityType !== "CONFIG" ||
      !["SIGNED", "MINED"].includes(signature.status) ||
      signature.contentHash.toLowerCase() !== expected.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "CONFIG_SIGNATURE_INVALID", message: "La firma CONFIG no corresponde a este cambio o no está lista." },
        { status: 409 },
      );
    }
  }
  await settingsRepo.set(flag.key, value, auth.session.username);
  return NextResponse.json({ key: flag.key, value, signatureRequired: needsSignature });
}
