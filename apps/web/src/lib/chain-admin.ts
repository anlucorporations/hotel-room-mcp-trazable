import "server-only";
import { createPublicClient, http, keccak256, toHex, type Address } from "viem";
import { activeChain } from "@/config/chain";
import { type OperatorWalletRole } from "@hotel/shared";
import { hotelOperationsAbi } from "@hotel/shared/abi";

/**
 * Lecturas on-chain para la administración de wallets y roles (F9 · T9.1/T9.2 · RNF-M-15).
 *
 * La regla de oro es **on-chain primero**: el back-office solo marca/revoca en `operator_wallets`
 * después de comprobar el recibo de la transacción y el estado real del rol o del respaldo. Así una
 * baja nunca deja un rol activo en la cadena.
 */

const ROLE_BY_WALLET_ROLE: Record<OperatorWalletRole, string> = {
  HEAD_MAINTENANCE: "HEAD_MAINTENANCE_ROLE",
  HEAD_KEEPER: "HEAD_KEEPER_ROLE",
  // OWNER_BACKUP no es un rol: es el respaldo de un rol existente (se gestiona aparte).
  OWNER_BACKUP: "HEAD_MAINTENANCE_ROLE",
};

function client() {
  const rpc = process.env.RPC_URL ?? process.env.BESU_RPC_URL;
  if (!rpc) throw new Error("RPC_URL no configurado: no se puede verificar la cadena.");
  return createPublicClient({ chain: activeChain, transport: http(rpc) });
}

export function operationsAddress(): Address | null {
  const value = process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS;
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}

/** Hash on-chain del rol de la wallet (`keccak256("HEAD_MAINTENANCE_ROLE")`…). */
export function roleHashForWalletRole(role: OperatorWalletRole): `0x${string}` {
  return keccak256(toHex(ROLE_BY_WALLET_ROLE[role]));
}

/** `true` si la tx está minada con éxito. Lanza si no existe o está revertida. */
export async function verifySuccessfulTx(txHash: `0x${string}`): Promise<boolean> {
  try {
    const receipt = await client().getTransactionReceipt({ hash: txHash });
    return receipt.status === "success";
  } catch {
    return false;
  }
}

/** Estado real del rol en `HotelOperations`. */
export async function hasRoleOnChain(
  role: OperatorWalletRole,
  walletAddress: Address,
): Promise<boolean> {
  const address = operationsAddress();
  if (!address) throw new Error("HOTEL_OPERATIONS_CONTRACT_ADDRESS no configurado.");
  const value = await client().readContract({
    address,
    abi: hotelOperationsAbi,
    functionName: "hasRole",
    args: [roleHashForWalletRole(role), walletAddress],
  });
  return value as boolean;
}

/** Respaldo configurado en `HotelOperations` para el rol. */
export async function backupForRoleOnChain(role: OperatorWalletRole): Promise<Address> {
  const address = operationsAddress();
  if (!address) throw new Error("HOTEL_OPERATIONS_CONTRACT_ADDRESS no configurado.");
  const value = await client().readContract({
    address,
    abi: hotelOperationsAbi,
    functionName: "backupForRole",
    args: [roleHashForWalletRole(role)],
  });
  return value as Address;
}
