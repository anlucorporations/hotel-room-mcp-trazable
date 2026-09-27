/**
 * Registro dinámico de habitaciones para los scripts de desarrollo/E2E (F8 · D-3/D-10/D-13/D-14).
 *
 * El contrato arranca con el registro **vacío** (D-13) y `mint` exige `_roomRegistered`, así que
 * cualquier guion que mintee debe registrar antes las habitaciones. Este helper es idempotente
 * (consulta `isRoomRegistered` antes de firmar) y **omite el paso con un aviso** contra contratos
 * anteriores al corte F8, para no romper despliegues antiguos.
 *
 * Firma con una wallet con `DEFAULT_ADMIN_ROLE` (la cuenta 0 del despliegue por defecto).
 */
import type { Account, Address, Chain, Hex, PublicClient, Transport, WalletClient } from "viem";
import { buildRoomRegistrationPlan, buildRoomSeed } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";

export interface RoomRegistrationResult {
  registered: number;
  alreadyRegistered: number;
  skipped: boolean;
}

export interface EnsureRoomsRegisteredOptions {
  publicClient: PublicClient;
  admin: WalletClient<Transport, Chain, Account>;
  contract: Address;
  /** Filas `{roomNumber, roomType}`; por defecto, el maestro completo (50 habitaciones). */
  rooms?: readonly { roomNumber: number; roomType: string }[];
  onLog?: (message: string) => void;
}

async function isRegistered(
  publicClient: PublicClient,
  contract: Address,
  room: number,
): Promise<boolean> {
  return (await publicClient.readContract({
    address: contract,
    abi: hotelNightsAbi,
    functionName: "isRoomRegistered",
    args: [BigInt(room)],
  })) as boolean;
}

export async function ensureRoomsRegistered(
  options: EnsureRoomsRegisteredOptions,
): Promise<RoomRegistrationResult> {
  const { publicClient, admin, contract, rooms, onLog = () => {} } = options;

  // Compatibilidad: un contrato anterior al corte no expone `isRoomRegistered` y la lectura revierte.
  try {
    await isRegistered(publicClient, contract, 101);
  } catch {
    onLog("contrato anterior al corte F8: se omite el registro de habitaciones");
    return { registered: 0, alreadyRegistered: 0, skipped: true };
  }

  const plan = buildRoomRegistrationPlan(rooms ?? buildRoomSeed());
  let registered = 0;
  let alreadyRegistered = 0;
  for (const entry of plan) {
    if (await isRegistered(publicClient, contract, entry.room)) {
      alreadyRegistered += 1;
      continue;
    }
    const hash: Hex = await admin.writeContract({
      address: contract,
      abi: hotelNightsAbi,
      functionName: "registerRoom",
      args: [BigInt(entry.room), entry.roomType],
      account: admin.account,
      chain: admin.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    registered += 1;
    onLog(`registerRoom hab ${entry.room} (${entry.roomType}) → ${hash.slice(0, 10)}…`);
  }
  onLog(`registro de habitaciones: ${registered} altas, ${alreadyRegistered} ya estaban`);
  return { registered, alreadyRegistered, skipped: false };
}
