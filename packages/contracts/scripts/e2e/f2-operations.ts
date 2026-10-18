/**
 * E2E REAL de F2 contra Anvil (chainId 81234): demuestra el desacoplamiento entre la **hot wallet del
 * relayer** y la **wallet del jefe que firma**.
 *
 * Qué se ejecuta de verdad (nada simulado):
 *   - el motor EIP-712 de `@hotel/shared` construye el TypedData de `ROOM_BLOCK` y la wallet del Jefe
 *     de Mantenimiento (cuenta #2 de Anvil) lo firma;
 *   - una hot wallet DISTINTA y **sin ningún rol** (cuenta #5) envía la transacción a
 *     `HotelOperations.roomBlocked` (es `msg.sender`, solo paga gas);
 *   - el contrato recupera al firmante, exige su rol y emite `OperationalAction` con
 *     `signer = recovered_signer`, NUNCA con el relayer;
 *   - el nonce queda consumido on-chain y el reenvío de la misma firma se rechaza;
 *   - `domainSeparator` del contrato coincide con el del motor.
 *
 * Requisitos: Anvil en `RPC_URL` (81234) y `HotelOperations` desplegado (`deployments/latest-operations.json`).
 * Uso: `pnpm --filter @hotel/contracts smoke:operations`.
 * Evidencia: `RepoTecnico/evidencias/f2-operations-e2e.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  actionTypeHash,
  anvilChain,
  deriveActionNonce,
  entityIdOf,
  hashOperationalAction,
  operationsDomain,
  operationsDomainSeparator,
  operationalTypedData,
  payloadHashOf,
} from "@hotel/shared";
import { hotelOperationsAbi } from "@hotel/shared/abi";

const here = dirname(fileURLToPath(import.meta.url));
// `scripts/e2e/` → `scripts/` → `packages/contracts/` → `packages/` → raíz del monorepo.
const repoRoot = resolve(here, "..", "..", "..", "..");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";

// Cuentas del mnemónico por defecto de Anvil (NUNCA usar fuera de dev/CI).
// #2 = Jefe de Mantenimiento (rol concedido por el deploy); #5 = relayer sin rol.
const HEAD_MAINTENANCE_PK =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const RELAYER_PK =
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as const;
const HEAD_MAINTENANCE = privateKeyToAccount(HEAD_MAINTENANCE_PK);
const RELAYER = privateKeyToAccount(RELAYER_PK);

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const deploymentPath = resolve(repoRoot, "packages/contracts/deployments/latest-operations.json");

function readOperationsAddress(): `0x${string}` {
  try {
    const raw = JSON.parse(readFileSync(deploymentPath, "utf8")) as { address: `0x${string}` };
    return raw.address;
  } catch {
    return fail(`no hay despliegue de HotelOperations en ${deploymentPath}; ejecuta el deploy antes`);
  }
}

const address = readOperationsAddress();

const publicClient = createPublicClient({ chain: anvilChain, transport: http(rpcUrl) });
const relayerClient = createWalletClient({
  account: RELAYER,
  chain: anvilChain,
  transport: http(rpcUrl),
});

const chainId = await publicClient.getChainId();
if (chainId !== 81234) fail(`chainId inesperado: ${chainId} (se esperaba 81234)`);

// ── 1. Construcción del mensaje con el motor compartido ──────────────────────
const domain = operationsDomain(chainId, address);
const entityUuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const payload = { roomNumber: 101, reason: "f2-e2e", until: null };
const nonce = deriveActionNonce(`f2-e2e-${Date.now()}`);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const entityId = entityIdOf("ROOM_BLOCK", entityUuid);
const payloadHash = payloadHashOf("ROOM_BLOCK", payload);
const message = {
  actionType: actionTypeHash("ROOM_BLOCK"),
  entityId,
  payloadHash,
  nonce,
  deadline,
};

// ── 2. El separador del contrato coincide con el del motor ───────────────────
const onChainSeparator = (await publicClient.readContract({
  address,
  abi: hotelOperationsAbi,
  functionName: "domainSeparator",
})) as Hex;
const localSeparator = operationsDomainSeparator(chainId, address);
if (onChainSeparator.toLowerCase() !== localSeparator.toLowerCase()) {
  fail(`domainSeparator divergente: contrato=${onChainSeparator} motor=${localSeparator}`);
}

// ── 3. La wallet del jefe firma; el relayer (sin rol) envía ──────────────────
const digest = hashOperationalAction(domain, message);
if (digest.length !== 66) fail(`digest mal formado: ${digest}`);
const signature = await HEAD_MAINTENANCE.signTypedData(operationalTypedData(domain, message));

const txHash = await relayerClient.writeContract({
  address,
  abi: hotelOperationsAbi,
  functionName: "roomBlocked",
  args: [message.entityId, message.payloadHash, message.nonce, message.deadline, signature],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
if (receipt.status !== "success") fail(`la transacción revirtió: ${txHash}`);

const events = parseEventLogs({
  abi: hotelOperationsAbi,
  eventName: "OperationalAction",
  logs: receipt.logs,
});
const action = events[0];
if (!action) fail("no se emitió OperationalAction");
const signer = action.args.signer as `0x${string}`;
const relayerAddress = RELAYER.address;
if (signer.toLowerCase() !== HEAD_MAINTENANCE.address.toLowerCase()) {
  fail(`signer del evento (${signer}) != wallet del jefe (${HEAD_MAINTENANCE.address})`);
}
if (signer.toLowerCase() === relayerAddress.toLowerCase()) {
  fail("el evento acreditó al RELAYER: el desacoplamiento de wallet está roto");
}

// ── 4. Anti-replay on-chain ──────────────────────────────────────────────────
const consumed = (await publicClient.readContract({
  address,
  abi: hotelOperationsAbi,
  functionName: "consumedNonce",
  args: [signer, message.nonce],
})) as boolean;
if (!consumed) fail("el nonce no quedó consumido on-chain");

let replayRejected = false;
try {
  const replayHash = await relayerClient.writeContract({
    address,
    abi: hotelOperationsAbi,
    functionName: "roomBlocked",
    args: [message.entityId, message.payloadHash, message.nonce, message.deadline, signature],
  });
  await publicClient.waitForTransactionReceipt({ hash: replayHash });
} catch {
  replayRejected = true;
}
if (!replayRejected) fail("el reenvío de la misma firma NO fue rechazado (replay posible)");

const evidence = {
  fecha: new Date().toISOString(),
  chainId,
  contrato: address,
  relayer: relayerAddress,
  firmante: HEAD_MAINTENANCE.address,
  actionType: "ROOM_BLOCK",
  entityUuid,
  entityId,
  payloadHash,
  nonce,
  deadline: message.deadline.toString(),
  digest,
  domainSeparator: { contrato: onChainSeparator, motor: localSeparator },
  txHash,
  evento: { signer, timestamp: action.args.timestamp?.toString() ?? null },
  nonceConsumido: consumed,
  replayRechazado: replayRejected,
};
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
mkdirSync(evidenceDir, { recursive: true });
const evidencePath = resolve(evidenceDir, "f2-operations-e2e.json");
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log("✓ F2 E2E OK — el relayer envió y el jefe quedó acreditado por la firma");
console.log(`  signer=${signer} relayer=${relayerAddress}`);
console.log(`  nonce consumido y replay rechazado; evidencia en ${evidencePath}`);
