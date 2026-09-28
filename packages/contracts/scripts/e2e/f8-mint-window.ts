import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  MINT_WINDOW_LOW_THRESHOLD,
  ROLES,
  anvilChain,
  buildMintWindow,
  deriveMintWindowStatus,
  todayYYYYMMDDUtc,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { ensureRoomsRegistered } from "../room-registry";

/**
 * Banco de pruebas REAL del **barrido global multi-habitación** (F8 · D-4/D-11/D-16/D-17).
 *
 * Reproduce, contra una cadena de verdad y sin base de datos, el bucle que ejecuta el botón
 * «Barrido global» de `/admin/habitacion`: planificar la ventana de **varias** habitaciones
 * publicadas, acuñar sólo lo que falta y volver a planificar para demostrar que **no se duplica**
 * nada. Además comprueba la regla de **agotamiento** de D-17 sobre el mismo cálculo que usa la web
 * (`buildMintWindow` + `deriveMintWindowStatus`).
 *
 * Uso (con Anvil y el contrato desplegado):
 *   RPC_URL=http://127.0.0.1:8545 CONTRACT_ADDRESS=0x… pnpm --filter @hotel/contracts e2e:f8
 * o el ensayo desechable que lo orquesta:
 *   bash scripts/dev/f8-mint-window-sweep.sh
 *
 * Variables: `ADMIN_PRIVATE_KEY` (o `MINTER_RELAYER_PRIVATE_KEY`); por defecto, la cuenta 0 de
 * Anvil (la del despliegue local, que concentra los roles).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
const evidencePath = resolve(evidenceDir, "f8-mint-window-sweep.json");

process.loadEnvFile(resolve(repoRoot, ".env"));

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = getAddress(requireEnv("CONTRACT_ADDRESS"));
/** Cuenta 0 de Anvil: la del despliegue local (DEFAULT_ADMIN_ROLE + MINTER_ROLE). */
const FALLBACK_ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADMIN_KEY = (process.env.ADMIN_PRIVATE_KEY ??
  process.env.MINTER_RELAYER_PRIVATE_KEY ??
  FALLBACK_ANVIL_KEY) as Hex;

const WINDOW_DAYS_SHORT = 5;
const WINDOW_DAYS_EXTENDED = 12;

/** Tres habitaciones de tipos distintos, como en el maestro real (simple/doble/suite). */
const ROOMS = [
  { roomNumber: 101, roomType: "simple", priceWei: parseEther("0.1") },
  { roomNumber: 116, roomType: "doble", priceWei: parseEther("0.15") },
  { roomNumber: 201, roomType: "suite", priceWei: parseEther("0.25") },
] as const;

const admin = privateKeyToAccount(ADMIN_KEY);
const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) }) as PublicClient;
const walletClient = createWalletClient({ account: admin, chain: anvilChain, transport: http(RPC_URL) });

interface Evidence {
  startedAt: string;
  finishedAt?: string;
  network: { rpcUrl: string; chainId: number; contract: string; operator: string };
  windowDays: { short: number; extended: number };
  checks: string[];
  transactions: Record<string, string>;
  counts: Record<string, number>;
  result?: "OK" | "FAIL";
}

const evidence: Evidence = {
  startedAt: new Date().toISOString(),
  network: { rpcUrl: RPC_URL, chainId: 0, contract: CONTRACT, operator: admin.address },
  windowDays: { short: WINDOW_DAYS_SHORT, extended: WINDOW_DAYS_EXTENDED },
  checks: [],
  transactions: {},
  counts: {},
};

let failures = 0;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno (.env de la raíz).`);
  return value;
}

function ok(message: string): void {
  evidence.checks.push(message);
  console.log(`  ✓ ${message}`);
}

function expect(condition: boolean, message: string): void {
  if (condition) {
    ok(message);
    return;
  }
  failures += 1;
  evidence.checks.push(`FALLO: ${message}`);
  console.error(`  ✗ ${message}`);
}

/** `ownerOf` devuelve `null` cuando el token no existe (revierte), en vez de propagar el error. */
async function ownerOfOrNull(tokenId: bigint): Promise<string | null> {
  try {
    const owner = (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    })) as string;
    return owner;
  } catch {
    return null;
  }
}

/** Envía una transacción y espera el recibo; registra el hash con su etiqueta. */
async function send(label: string, data: Hex): Promise<string> {
  const hash = await walletClient.sendTransaction({ to: CONTRACT, data });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status === "success", `${label}: recibo con estado success (${hash.slice(0, 10)}…)`);
  evidence.transactions[label] = hash;
  return hash;
}

/** Noches que faltan por acuñar en una habitación, según la CADENA (idempotencia D-16). */
async function planRoom(room: (typeof ROOMS)[number], today: number, windowDays: number) {
  const nights = buildMintWindow({
    room: room.roomNumber,
    roomType: room.roomType,
    todayYYYYMMDD: today,
    windowDays,
  });
  const missing = [];
  for (const night of nights) {
    if ((await ownerOfOrNull(night.tokenId)) === null) missing.push(night);
  }
  return missing;
}

/** Barrido secuencial multi-habitación: planifica y acuña sólo lo que falta (como el botón real). */
async function sweep(
  today: number,
  windowDays: number,
  phase: string,
): Promise<{ planned: number; minted: number }> {
  let planned = 0;
  let minted = 0;
  for (const room of ROOMS) {
    const missing = await planRoom(room, today, windowDays);
    planned += missing.length;
    console.log(`    · habitación ${room.roomNumber} (${room.roomType}): ${missing.length} por acuñar`);
    for (const night of missing) {
      await send(
        `${phase}-mint-${room.roomNumber}-${night.dateYYYYMMDD}`,
        encodeFunctionData({
          abi: hotelNightsAbi,
          functionName: "mint",
          args: [BigInt(room.roomNumber), BigInt(night.dateYYYYMMDD), room.priceWei, `ipfs://f8-e2e/${room.roomNumber}/${night.dateYYYYMMDD}`],
        }),
      );
      minted += 1;
    }
  }
  return { planned, minted };
}

/** Noches acuñadas y no vendidas (la «noche libre» de la ventana, D-17) para una habitación. */async function freeNightsOf(room: (typeof ROOMS)[number], today: number, windowDays: number): Promise<number> {
  let free = 0;
  for (const night of buildMintWindow({
    room: room.roomNumber,
    roomType: room.roomType,
    todayYYYYMMDD: today,
    windowDays,
  })) {
    if ((await ownerOfOrNull(night.tokenId)) !== null) free += 1;
  }
  return free;
}

/**
 * Asegura que el operador puede acuñar. El constructor del contrato solo concede
 * `DEFAULT_ADMIN_ROLE` a quien despliega (el bootstrap completo de roles vive en `Deploy.s.sol`),
 * así que en la cadena desechable el propio admin se otorga `MINTER_ROLE`. Contra el Anvil global,
 * donde la cuenta ya es MINTER, no envía nada.
 */
async function ensureMinterRole(operator: Address): Promise<void> {
  const hasRole = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "hasRole",
    args: [ROLES.MINTER_ROLE, operator],
  })) as boolean;
  if (hasRole) {
    ok("el operador ya tiene MINTER_ROLE (no se envía ninguna transacción de permisos)");
    return;
  }
  await send(
    "grantRole-MINTER_ROLE",
    encodeFunctionData({
      abi: hotelNightsAbi,
      functionName: "grantRole",
      args: [ROLES.MINTER_ROLE, operator],
    }),
  );
  const granted = (await publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName: "hasRole",
    args: [ROLES.MINTER_ROLE, operator],
  })) as boolean;
  expect(granted, "MINTER_ROLE concedido al operador para poder acuñar");
}

async function main(): Promise<void> {
  const chainId = await publicClient.getChainId();
  evidence.network.chainId = chainId;
  console.log(`==> F8 · barrido multi-habitación · cadena ${chainId} · contrato ${CONTRACT}`);
  console.log(`    operador ${admin.address}${process.env.MINTER_RELAYER_PRIVATE_KEY ? "" : " (clave 0 de Anvil por defecto)"}`);

  // «Hoy» se lee del RELOJ DE LA CADENA, que es el que decide la caducidad (lección de M6).
  const block = await publicClient.getBlock();
  const today = todayYYYYMMDDUtc(new Date(Number(block.timestamp) * 1000));
  console.log(`    hoy (reloj de la cadena): ${today}`);

  // ── A. Registro dinámico de las habitaciones (D-3/D-10/D-13) ────────────────────────────────
  const registration = await ensureRoomsRegistered({
    publicClient,
    admin: walletClient,
    contract: CONTRACT,
    rooms: ROOMS.map((room) => ({ roomNumber: room.roomNumber, roomType: room.roomType })),
    onLog: (message) => console.log(`    ${message}`),
  });
  expect(!registration.skipped, "el contrato expone el registro dinámico (isRoomRegistered)");
  await ensureMinterRole(admin.address);
  for (const room of ROOMS) {
    const registered = (await publicClient.readContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "isRoomRegistered",
      args: [BigInt(room.roomNumber)],
    })) as boolean;
    expect(registered, `habitación ${room.roomNumber} registrada on-chain`);
  }

  // ── B. Barrido inicial con ventana corta ────────────────────────────────────────────────────
  const first = await sweep(today, WINDOW_DAYS_SHORT, "b1");
  const expectedFirst = ROOMS.length * WINDOW_DAYS_SHORT;
  expect(first.planned === expectedFirst, `el barrido planifica ${expectedFirst} noches (${ROOMS.length} habitaciones × ${WINDOW_DAYS_SHORT} días)`);
  expect(first.minted === expectedFirst, `el barrido acuña ${expectedFirst} noches reales`);
  evidence.counts.firstSweepPlanned = first.planned;
  evidence.counts.firstSweepMinted = first.minted;

  let existing = 0;
  for (const room of ROOMS) {
    for (const night of buildMintWindow({
      room: room.roomNumber,
      roomType: room.roomType,
      todayYYYYMMDD: today,
      windowDays: WINDOW_DAYS_SHORT,
    })) {
      if ((await ownerOfOrNull(night.tokenId)) !== null) existing += 1;
    }
  }
  expect(existing === expectedFirst, `las ${expectedFirst} noches existen on-chain (sin duplicados)`);
  evidence.counts.existingAfterFirstSweep = existing;

  // ── C. Idempotencia (D-16): repetir el barrido no acuña nada y no gasta gas ────────────────
  const transactionsBefore = Object.keys(evidence.transactions).length;
  const second = await sweep(today, WINDOW_DAYS_SHORT, "c1");
  const transactionsAfter = Object.keys(evidence.transactions).length;
  expect(second.planned === 0, "el segundo barrido no encuentra ninguna noche pendiente (idempotente)");
  expect(second.minted === 0, "el segundo barrido no envía ninguna transacción");
  expect(transactionsAfter === transactionsBefore, "no se ha firmado ninguna transacción de más");

  // ── D. El duplicado revierte: la identidad de la noche es su tokenId ───────────────────────
  const sample = buildMintWindow({
    room: ROOMS[0].roomNumber,
    roomType: ROOMS[0].roomType,
    todayYYYYMMDD: today,
    windowDays: 1,
  })[0];
  if (!sample) throw new Error("la ventana de 1 día no produjo ninguna noche");
  let reverted = false;
  try {
    await publicClient.simulateContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(ROOMS[0].roomNumber), BigInt(sample.dateYYYYMMDD), ROOMS[0].priceWei, "ipfs://f8-e2e/duplicado"],
      account: admin,
    });
  } catch {
    reverted = true;
  }
  expect(reverted, "volver a acuñar la misma noche revierte on-chain (nada de tokens duplicados)");

  // ── E. Agotamiento (D-17): la ventana corta avisa; al ampliarla, deja de avisar ────────────
  const freeShort = await freeNightsOf(ROOMS[0], today, WINDOW_DAYS_SHORT);
  const statusShort = deriveMintWindowStatus({
    windowDays: WINDOW_DAYS_SHORT,
    missing: 0,
    freeNights: freeShort,
  });
  expect(
    statusShort.low && freeShort < MINT_WINDOW_LOW_THRESHOLD,
    `con ${freeShort} noches libres (< ${MINT_WINDOW_LOW_THRESHOLD}) la ventana corta está en agotamiento`,
  );

  const extension = await sweep(today, WINDOW_DAYS_EXTENDED, "e1");
  const expectedExtension = ROOMS.length * (WINDOW_DAYS_EXTENDED - WINDOW_DAYS_SHORT);
  expect(extension.minted === expectedExtension, `ampliar la ventana acuña sólo las ${expectedExtension} noches nuevas`);
  const freeExtended = await freeNightsOf(ROOMS[0], today, WINDOW_DAYS_EXTENDED);
  const statusExtended = deriveMintWindowStatus({
    windowDays: WINDOW_DAYS_EXTENDED,
    missing: 0,
    freeNights: freeExtended,
  });
  expect(
    !statusExtended.low && freeExtended >= MINT_WINDOW_LOW_THRESHOLD,
    `tras ampliar a ${WINDOW_DAYS_EXTENDED} días hay ${freeExtended} noches libres y el aviso se rearma`,
  );
  evidence.counts.freeNightsShort = freeShort;
  evidence.counts.freeNightsExtended = freeExtended;
  evidence.counts.extensionMinted = extension.minted;

  // ── F. Cada habitación acaba con su ventana completa y sin repetir token ───────────────────
  for (const room of ROOMS) {
    const pending = await planRoom(room, today, WINDOW_DAYS_EXTENDED);
    expect(pending.length === 0, `habitación ${room.roomNumber}: ventana de ${WINDOW_DAYS_EXTENDED} días completa al terminar`);
  }
  evidence.counts.mintedTotal = Object.keys(evidence.transactions).filter((key) => key.includes("-mint-")).length;
}

function writeEvidence(): void {
  evidence.finishedAt = new Date().toISOString();
  evidence.result = failures === 0 ? "OK" : "FAIL";
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

void main()
  .then(() => {
    writeEvidence();
    if (failures > 0) {
      console.error(`\n❌ Banco de pruebas F8 FALLIDO: ${failures} comprobación(es) en rojo.`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `\n✅ Banco de pruebas F8 OK: barrido multi-habitación idempotente, sin duplicados y con el ` +
        `aviso de agotamiento (D-17) funcionando. Evidencia: ${evidencePath.replace(`${repoRoot}/`, "")}`,
    );
  })
  .catch((error: unknown) => {
    failures += 1;
    writeEvidence();
    console.error("\n❌ Banco de pruebas F8 interrumpido:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
