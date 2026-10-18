/**
 * E2E REAL de F3 contra Anvil: el **outbox de anclaje** con el relayer de verdad.
 *
 * Qué se ejecuta (nada simulado salvo el repositorio, que es en memoria porque este entorno no tiene
 * PostgreSQL):
 *   1. Se construye y firma una operación `ROOM_BLOCK` con el motor EIP-712 (`@hotel/shared`).
 *   2. `AnchorOutbox.runOnce()` reclama la firma de un outbox en memoria y la ancla en el contrato
 *      `HotelOperations` desplegado, con una hot wallet **sin roles** como `msg.sender`.
 *   3. El evento `OperationalAction` acredita al JEFE (no al relayer) y la fila queda `MINED`.
 *   4. **Reinicio a mitad**: una fila ya `SIGNED` con `tx_hash` de una tx minada se marca `MINED` sin
 *      reenviar (recuperación idempotente).
 *   5. **RPC caído** (`http://127.0.0.1:1`): el anclaje falla y la fila se reprograma con el backoff
 *      (30 s) sin perderse.
 *
 * Requisitos: Anvil en 81234 con `HotelOperations` desplegado y el rol del jefe concedido (lo hace
 * `scripts/smoke-operations.sh`). Evidencia en `RepoTecnico/evidencias/f3-anchor-outbox-e2e.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";
import {
  actionTypeHash,
  anvilChain,
  deriveActionNonce,
  entityIdOf,
  operationsDomain,
  operationalTypedData,
  payloadHashOf,
} from "@hotel/shared";
import { privateKeyToAccount } from "viem/accounts";
import {
  AnchorOutbox,
  type AnchorOutboxRepository,
  type OutboxSignature,
} from "../../src/anchor-outbox";
import { ViemAnchorRelayer } from "../../src/anchor-relayer";

const here = dirname(fileURLToPath(import.meta.url));
// `apps/worker/scripts/e2e/` → scripts → worker → apps → raíz del monorepo.
const repoRoot = resolve(here, "..", "..", "..", "..");
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";

const HEAD_MAINTENANCE_PK =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const; // #2
const RELAYER_PK =
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as const; // #5

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
    return fail(`no hay despliegue de HotelOperations en ${deploymentPath}`);
  }
}
const contractAddress = readOperationsAddress();

/** Outbox en memoria (sin PostgreSQL): implementa el contrato que consume `AnchorOutbox`. */
class InMemoryOutboxRepository implements AnchorOutboxRepository {
  readonly rows = new Map<string, OutboxSignature>();
  readonly markedMined: { id: string; txHash: string }[] = [];
  readonly markedFailed: { id: string; nextAttemptAt: Date | null; error: string }[] = [];

  seed(row: OutboxSignature): void {
    this.rows.set(row.id, row);
  }

  async claimForAnchoring(options?: { limit?: number }): Promise<OutboxSignature[]> {
    const limit = options?.limit ?? 10;
    // El repositorio real filtra por `status='SIGNED'`; aquí todas las filas sembradas lo están. Las
    // que YA tienen `tx_hash` también se reclaman: es lo que permite comprobar su recibo y no reenviar.
    return [...this.rows.values()].slice(0, limit);
  }

  async findById(id: string): Promise<OutboxSignature | null> {
    return this.rows.get(id) ?? null;
  }

  async markMined(id: string, txHash: string): Promise<void> {
    this.markedMined.push({ id, txHash });
  }

  async markFailed(id: string, errorMessage: string, nextAttemptAt: Date | null): Promise<void> {
    this.markedFailed.push({ id, nextAttemptAt, error: errorMessage });
  }

  async recoverAfterRestart(): Promise<{ requeued: number; expired: number }> {
    return { requeued: 0, expired: 0 };
  }

  async expireStale(): Promise<number> {
    return 0;
  }
}

async function signedRow(id: string, txHash: string | null = null): Promise<OutboxSignature> {
  const account = privateKeyToAccount(HEAD_MAINTENANCE_PK);
  const entityUuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const payload = { roomNumber: 101, reason: "f3-e2e", until: null };
  const nonce = deriveActionNonce(`f3-e2e-${id}`);
  const deadline = new Date(Date.now() + 3600_000);
  const domain = operationsDomain(anvilChain.id, contractAddress);
  const message = {
    actionType: actionTypeHash("ROOM_BLOCK"),
    entityId: entityIdOf("ROOM_BLOCK", entityUuid),
    payloadHash: payloadHashOf("ROOM_BLOCK", payload),
    nonce: nonce as Hex,
    deadline: BigInt(Math.floor(deadline.getTime() / 1000)),
  };
  const signature = await account.signTypedData(operationalTypedData(domain, message));
  return {
    id,
    entityType: "ROOM_BLOCK",
    entityId: entityUuid,
    contentHash: message.payloadHash,
    nonce,
    deadline,
    signature,
    txHash,
    signerAddress: account.address,
    retryCount: 0,
    nextAttemptAt: null,
    createdAt: new Date(),
    expiresAt: null,
  };
}

const relayer = new ViemAnchorRelayer({
  rpcUrl,
  contractAddress,
  chain: anvilChain,
  privateKey: RELAYER_PK,
});

// ── 1. Ciclo normal: reclama y ancla ─────────────────────────────────────────
const repository = new InMemoryOutboxRepository();
repository.seed(await signedRow("f3-e2e-1"));
const outbox = new AnchorOutbox({ repository, relayer });
const cycle = await outbox.runOnce();
if (cycle.claimed !== 1 || cycle.mined !== 1) {
  fail(`ciclo inesperado: claimed=${cycle.claimed} mined=${cycle.mined} failed=${cycle.failed}`);
}
const mined = repository.markedMined[0]!;
if (!mined.txHash.startsWith("0x") || mined.txHash.length !== 66) {
  fail(`txHash mal formado: ${mined.txHash}`);
}

// ── 2. Reinicio a mitad: una tx ya minada NO se reenvía ──────────────────────
const recoveryRepository = new InMemoryOutboxRepository();
recoveryRepository.seed(await signedRow("f3-e2e-2", mined.txHash));
const recoveryCycle = await new AnchorOutbox({
  repository: recoveryRepository,
  relayer,
}).runOnce();
if (recoveryCycle.mined !== 1 || recoveryRepository.markedMined[0]?.txHash !== mined.txHash) {
  fail("la recuperación de una tx ya minada no marcó MINED sin reenviar");
}

// ── 3. RPC caído: la fila se reprograma con backoff, no se pierde ────────────
const deadRepository = new InMemoryOutboxRepository();
const row = await signedRow("f3-e2e-3");
deadRepository.seed(row);
const downRelayer = new ViemAnchorRelayer({
  rpcUrl: "http://127.0.0.1:1",
  contractAddress,
  chain: anvilChain,
  privateKey: RELAYER_PK,
  timeoutMs: 1000,
});
const downCycle = await new AnchorOutbox({
  repository: deadRepository,
  relayer: downRelayer,
  options: { backoffSeconds: [30, 60, 120, 300, 600] },
}).runOnce();
const downFailure = deadRepository.markedFailed[0];
if (downCycle.failed !== 1 || !downFailure) {
  fail(`con el RPC caído se esperaba un fallo reprogramado, hubo ${downCycle.failed}`);
}
if (downFailure.nextAttemptAt === null) {
  fail("el fallo con RPC caído quedó terminal; debía reprogramarse con backoff");
}
const backoffMs = downFailure.nextAttemptAt.getTime() - Date.now();
if (backoffMs < 25_000 || backoffMs > 40_000) {
  fail(`backoff fuera de rango (${Math.round(backoffMs / 1000)} s); se esperaban ~30 s`);
}

const evidence = {
  fecha: new Date().toISOString(),
  contrato: contractAddress,
  relayer: privateKeyToAccount(RELAYER_PK).address,
  firmante: privateKeyToAccount(HEAD_MAINTENANCE_PK).address,
  cicloNormal: { claimed: cycle.claimed, mined: cycle.mined, txHash: mined.txHash },
  recuperacion: { mined: recoveryCycle.mined, reenviado: false },
  rpcCaido: {
    failed: downCycle.failed,
    nextAttemptAt: downFailure.nextAttemptAt.toISOString(),
    backoffSegundos: Math.round(backoffMs / 1000),
    error: downFailure.error,
  },
};
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
mkdirSync(evidenceDir, { recursive: true });
const evidencePath = resolve(evidenceDir, "f3-anchor-outbox-e2e.json");
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log("✓ F3 E2E OK — anclaje real, recuperación idempotente y backoff con RPC caído");
console.log(`  txHash=${mined.txHash}`);
console.log(`  evidencia en ${evidencePath}`);
