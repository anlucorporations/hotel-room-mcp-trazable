import "server-only";
import {
  OperationsRepository,
  actionTypeHash,
  entityIdOf,
  operationsDomain,
  operationsDomainSeparator,
  operationalTypedData,
  payloadHashOf,
  recoverOperationalSigner,
  type SignatureEntityType,
  type SignatureRecord,
} from "@hotel/shared";
import { activeChain } from "@/config/chain";

/**
 * Firma EIP-712 de operaciones de mantenimiento (F4 · T4.4/T4.5).
 *
 * El flujo es el de F2/F3 y **no se reimplementa criptografía**:
 *   1. `POST /api/mantenimiento/signatures` crea la fila `PENDING` del outbox y devuelve el TypedData
 *      que la wallet del jefe tiene que firmar (domain `HotelOperations`, `chainId` de la red activa).
 *   2. `PATCH /api/mantenimiento/signatures/[id]` recupera el firmante (viem), comprueba que es la
 *      wallet asignada al rol y marca la fila `SIGNED` (el worker la anclará con el relayer).
 *   3. `POST /api/mantenimiento/rooms/[id]/block|unblock` aplica el cambio off-chain **solo** si la
 *      firma está `SIGNED`, es de esa entidad y su `contentHash` coincide con el payload que se va a
 *      aplicar. Así no se puede reutilizar una firma para otra habitación ni otro motivo.
 *
 * Si falta `HOTEL_OPERATIONS_CONTRACT_ADDRESS`, las rutas responden 503 (`OPERATIONS_NOT_CONFIGURED`):
 * fallar en cerrado es preferible a firmar un dominio contra una dirección inventada.
 */

/** Acciones firmables de la suite de mantenimiento. */
export type MaintenanceSignatureAction = Extract<
  SignatureEntityType,
  "ROOM_BLOCK" | "ROOM_UNBLOCK" | "PREVENTIVE_TASK"
>;

/** Rol de wallet que firma las operaciones de mantenimiento (D-C1/D-C4). */
export const MAINTENANCE_WALLET_ROLE = "HEAD_MAINTENANCE" as const;
/** Snapshot del rol on-chain asociado a la firma. */
export const MAINTENANCE_ROLE_SNAPSHOT = "HEAD_MAINTENANCE_ROLE" as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Dirección del contrato `HotelOperations` o `null` si el entorno no la tiene configurada. */
export function operationsContractAddress(): `0x${string}` | null {
  const raw = process.env.HOTEL_OPERATIONS_CONTRACT_ADDRESS?.trim();
  return raw && ADDRESS_PATTERN.test(raw) ? (raw as `0x${string}`) : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

/** Payload canónico de cada acción: lo que se firma debe ser exactamente lo que se aplica. */
export function buildMaintenancePayload(
  action: MaintenanceSignatureAction,
  input: {
    readonly roomId?: string;
    readonly incidentId?: string | null;
    readonly reason?: string | null;
    readonly until?: string | null;
    readonly taskId?: string;
  },
): Record<string, unknown> {
  switch (action) {
    case "ROOM_BLOCK":
      return {
        roomId: input.roomId ?? null,
        incidentId: input.incidentId ?? null,
        reason: input.reason ?? null,
        until: input.until ?? null,
      };
    case "ROOM_UNBLOCK":
      return {
        roomId: input.roomId ?? null,
        incidentId: input.incidentId ?? null,
        reason: input.reason ?? null,
      };
    case "PREVENTIVE_TASK":
      return { taskId: input.taskId ?? null };
  }
}

/** Payload y TypedData listos para JSON (los `bigint` del TypedData se serializan como string). */
export interface PreparedMaintenanceSignature {
  readonly signatureId: string;
  readonly contentHash: string;
  readonly nonce: string;
  readonly deadline: string;
  readonly roleSnapshot: typeof MAINTENANCE_ROLE_SNAPSHOT;
  readonly typedData: {
    readonly domain: Record<string, unknown>;
    readonly types: Record<string, unknown>;
    readonly primaryType: string;
    readonly message: Record<string, unknown>;
  };
}

/** Materializa el TypedData a partir de una fila del outbox (para firmar y para verificar). */
function typedDataFor(record: SignatureRecord): {
  domain: ReturnType<typeof operationsDomain>;
  message: Parameters<typeof operationalTypedData>[1];
} {
  const contract = operationsContractAddress();
  if (!contract) throw new OperationsSignatureError("OPERATIONS_NOT_CONFIGURED", "El contrato de operaciones no está configurado.");
  if (!record.nonce) throw new OperationsSignatureError("SIGNATURE_MALFORMED", "La firma no tiene nonce.");
  const domain = operationsDomain(activeChain.id, contract);
  const message = {
    actionType: actionTypeHash(record.entityType),
    entityId: entityIdOf(record.entityType, record.entityId),
    payloadHash: record.contentHash as `0x${string}`,
    nonce: record.nonce as `0x${string}`,
    deadline: BigInt(Math.floor((record.deadline as Date).getTime() / 1000)),
  };
  return { domain, message };
}

export class OperationsSignatureError extends Error {
  constructor(
    readonly code:
      | "OPERATIONS_NOT_CONFIGURED"
      | "SIGNATURE_MALFORMED"
      | "SIGNATURE_NOT_FOUND"
      | "SIGNATURE_NOT_READY"
      | "SIGNATURE_ENTITY_MISMATCH"
      | "SIGNATURE_PAYLOAD_MISMATCH"
      | "SIGNATURE_WALLET_NOT_ASSIGNED"
      | "SIGNATURE_SIGNER_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "OperationsSignatureError";
  }
}

/**
 * Crea la solicitud de firma y devuelve el TypedData. Exige que el firmante sea la wallet activa del
 * rol (o el owner, que puede preparar la firma para el jefe).
 */
export async function prepareMaintenanceSignature(input: {
  readonly action: MaintenanceSignatureAction;
  readonly entityUuid: string;
  readonly payload: Record<string, unknown>;
  readonly signerAddress: string;
  readonly username: string;
  readonly sessionRole: string;
  readonly operations?: OperationsRepository;
}): Promise<PreparedMaintenanceSignature> {
  if (!operationsContractAddress()) {
    throw new OperationsSignatureError("OPERATIONS_NOT_CONFIGURED", "El contrato de operaciones no está configurado.");
  }
  const operations = input.operations ?? new OperationsRepository();
  const assigned = await operations.findActiveWallet(MAINTENANCE_WALLET_ROLE);
  const isOwner = input.sessionRole === "DEFAULT_ADMIN_ROLE";
  if (!assigned) {
    throw new OperationsSignatureError(
      "SIGNATURE_WALLET_NOT_ASSIGNED",
      "No hay wallet activa asignada al jefe de mantenimiento.",
    );
  }
  if (!isOwner && assigned.username !== input.username) {
    throw new OperationsSignatureError(
      "SIGNATURE_WALLET_NOT_ASSIGNED",
      "La wallet activa de mantenimiento pertenece a otro operador.",
    );
  }
  if (assigned.walletAddress.toLowerCase() !== input.signerAddress.toLowerCase()) {
    throw new OperationsSignatureError(
      "SIGNATURE_WALLET_NOT_ASSIGNED",
      "El firmante no es la wallet activa del jefe de mantenimiento.",
    );
  }

  const contentHash = payloadHashOf(input.action, input.payload);
  const deadline = new Date(Date.now() + 10 * 60_000);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  const record = await operations.createSignatureRequest({
    entityType: input.action,
    entityId: input.entityUuid,
    eventName: "OperationalAction",
    contentHash,
    signerAddress: input.signerAddress,
    deadline,
    expiresAt,
  });

  const { domain, message } = typedDataFor(record);
  return {
    signatureId: record.id,
    contentHash,
    nonce: record.nonce as string,
    deadline: (record.deadline as Date).toISOString(),
    roleSnapshot: MAINTENANCE_ROLE_SNAPSHOT,
    typedData: {
      domain: { ...domain },
      types: operationalTypedData(domain, message).types as unknown as Record<string, unknown>,
      primaryType: "OperationalAction",
      message: {
        actionType: message.actionType,
        entityId: message.entityId,
        payloadHash: message.payloadHash,
        nonce: message.nonce,
        deadline: message.deadline.toString(),
      },
    },
  };
}

/**
 * Verifica una firma presentada y marca la fila `SIGNED`.
 *
 * Comprueba, en este orden: existe, está `PENDING`, el firmante recuperado es la wallet asignada al
 * rol y coincide con la registrada. La marca la hace el repositorio (que también compara el firmante).
 */
export async function confirmMaintenanceSignature(input: {
  readonly signatureId: string;
  readonly signature: `0x${string}`;
  readonly operations?: OperationsRepository;
}): Promise<SignatureRecord> {
  const operations = input.operations ?? new OperationsRepository();
  const record = await operations.findById(input.signatureId);
  if (!record) throw new OperationsSignatureError("SIGNATURE_NOT_FOUND", "La solicitud de firma no existe.");
  if (record.status !== "PENDING") {
    throw new OperationsSignatureError("SIGNATURE_NOT_READY", `La firma está en estado ${record.status}.`);
  }
  const contract = operationsContractAddress();
  if (!contract) throw new OperationsSignatureError("OPERATIONS_NOT_CONFIGURED", "El contrato de operaciones no está configurado.");

  const { domain, message } = typedDataFor(record);
  const recovered = await recoverOperationalSigner(domain, message, input.signature);
  if (recovered.toLowerCase() !== record.signerAddress.toLowerCase()) {
    throw new OperationsSignatureError(
      "SIGNATURE_SIGNER_MISMATCH",
      "La firma recuperada no corresponde a la wallet asignada.",
    );
  }
  const signed = await operations.markSigned(record.id, {
    signature: input.signature,
    recoveredSigner: recovered,
    domainHash: operationsDomainSeparator(activeChain.id, contract),
    roleSnapshot: MAINTENANCE_ROLE_SNAPSHOT,
  });
  if (!signed) throw new OperationsSignatureError("SIGNATURE_NOT_READY", "La firma no se pudo confirmar.");
  return signed;
}

/**
 * Comprueba que una firma `SIGNED` autoriza **exactamente** el payload que se va a aplicar.
 *
 * Es la puerta que impide reutilizar una firma para otra habitación, otro motivo o otra acción.
 */
export async function assertSignatureAuthorizes(input: {
  readonly signatureId: string;
  readonly action: MaintenanceSignatureAction;
  readonly entityUuid: string;
  readonly payload: Record<string, unknown>;
  readonly operations?: OperationsRepository;
}): Promise<SignatureRecord> {
  const operations = input.operations ?? new OperationsRepository();
  const record = await operations.findById(input.signatureId);
  if (!record) throw new OperationsSignatureError("SIGNATURE_NOT_FOUND", "La firma no existe.");
  if (record.status !== "SIGNED") {
    throw new OperationsSignatureError(
      "SIGNATURE_NOT_READY",
      `La firma debe estar SIGNED (estado actual: ${record.status}).`,
    );
  }
  if (record.entityType !== input.action || record.entityId.toLowerCase() !== input.entityUuid.toLowerCase()) {
    throw new OperationsSignatureError("SIGNATURE_ENTITY_MISMATCH", "La firma es de otra entidad o acción.");
  }
  const expectedHash = payloadHashOf(input.action, input.payload);
  if (record.contentHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new OperationsSignatureError(
      "SIGNATURE_PAYLOAD_MISMATCH",
      "La firma no corresponde a este payload (habitación/motivo/fechas distintos).",
    );
  }
  if (record.roleSnapshot !== MAINTENANCE_ROLE_SNAPSHOT) {
    throw new OperationsSignatureError("SIGNATURE_SIGNER_MISMATCH", "La firma no acredita el rol de mantenimiento.");
  }
  return record;
}
