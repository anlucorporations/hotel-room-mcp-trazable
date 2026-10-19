import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { OperationsRepository, type OperatorWalletRole } from "@hotel/shared";
import { requireRole } from "@/lib/guard";
import {
  backupForRoleOnChain,
  hasRoleOnChain,
  operationsAddress,
  verifySuccessfulTx,
} from "@/lib/chain-admin";

export const dynamic = "force-dynamic";

const repo = new OperationsRepository();
const WALLET_ROLES: readonly OperatorWalletRole[] = ["HEAD_MAINTENANCE", "HEAD_KEEPER", "OWNER_BACKUP"];

/**
 * GET /api/admin/system/wallets — wallets de jefe y roles on-chain (F9 · T9.1/T9.2, CU-V-35/38).
 * POST — asigna wallet/rol **solo tras verificar en cadena** la transacción y el rol (RNF-M-15).
 * DELETE — revoca la wallet **solo después** de comprobar que el rol ya no está activo on-chain.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  if (!operationsAddress()) {
    return NextResponse.json({ error: "OPERATIONS_NOT_CONFIGURED", message: "Contrato de operaciones no configurado." }, { status: 503 });
  }
  const wallets = await repo.listWallets();
  const enriched = await Promise.all(
    wallets.map(async (wallet) => ({
      ...wallet,
      onChainRoleActive:
        wallet.role === "OWNER_BACKUP"
          ? false
          : await hasRoleOnChain(wallet.role, wallet.walletAddress as `0x${string}`).catch(() => null),
    })),
  );
  const backups = await Promise.all(
    (["HEAD_MAINTENANCE", "HEAD_KEEPER"] as const).map(async (role) => ({
      role,
      backup: await backupForRoleOnChain(role).catch(() => null),
    })),
  );
  return NextResponse.json({ wallets: enriched, backups });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { username?: unknown; role?: unknown; walletAddress?: unknown; txHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username : "";
  const role = body.role as OperatorWalletRole;
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  if (!username || !WALLET_ROLES.includes(role) || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress) || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "username, role, walletAddress y txHash son obligatorios." },
      { status: 400 },
    );
  }
  if (!(await verifySuccessfulTx(txHash as `0x${string}`))) {
    return NextResponse.json({ error: "TX_NOT_MINED", message: "La transacción no está minada con éxito." }, { status: 409 });
  }
  if (role !== "OWNER_BACKUP") {
    const active = await hasRoleOnChain(role, walletAddress as `0x${string}`).catch(() => false);
    if (!active) {
      return NextResponse.json(
        { error: "ROLE_NOT_GRANTED_ONCHAIN", message: "La wallet no tiene el rol activo en la cadena; no se marca en BD." },
        { status: 409 },
      );
    }
  } else {
    const backup = await backupForRoleOnChain("HEAD_MAINTENANCE").catch(() => null);
    if (backup && backup.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "BACKUP_MISMATCH", message: "La wallet no es el respaldo configurado on-chain." },
        { status: 409 },
      );
    }
  }
  const wallet = await repo.assignWallet({
    username,
    role,
    walletAddress,
    assignedBy: auth.session.username,
    backupForRole: role === "OWNER_BACKUP" ? "HEAD_MAINTENANCE_ROLE" : null,
  });
  return NextResponse.json({ wallet }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(request, "DEFAULT_ADMIN_ROLE");
  if (!auth.ok) return auth.response;
  let body: { username?: unknown; txHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Cuerpo JSON no válido." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  if (!username || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "username y txHash son obligatorios." }, { status: 400 });
  }
  if (!(await verifySuccessfulTx(txHash as `0x${string}`))) {
    return NextResponse.json({ error: "TX_NOT_MINED", message: "La transacción no está minada con éxito." }, { status: 409 });
  }
  const wallet = await repo.listWallets().then((rows) => rows.find((row) => row.username === username));
  if (!wallet) return NextResponse.json({ error: "WALLET_NOT_FOUND", message: "La wallet no existe." }, { status: 404 });
  if (wallet.role !== "OWNER_BACKUP") {
    const stillActive = await hasRoleOnChain(wallet.role, wallet.walletAddress as `0x${string}`).catch(() => true);
    if (stillActive) {
      return NextResponse.json(
        { error: "ROLE_STILL_ACTIVE", message: "El rol sigue activo en la cadena: revócalo on-chain antes de la baja." },
        { status: 409 },
      );
    }
  }
  const revoked = await repo.revokeWallet(username);
  return NextResponse.json({ wallet: revoked });
}
