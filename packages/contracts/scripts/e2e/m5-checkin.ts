/**
 * E2E REAL del hito M5 (D-05, D-13) contra Anvil + PostgreSQL + Redis: check-in de recepción con
 * ancla on-chain obligatoria, resguardo **de un solo uso** y contingencia sin PII.
 *
 * Qué se ejecuta de verdad (nada simulado):
 *   - se mintea y se compra una noche on-chain (primaria) con las cuentas de Anvil;
 *   - se emite el resguardo con `createTicketJWS` (el MISMO módulo que usa la API) y se firma la
 *     autorización EIP-712 con la clave del huésped;
 *   - se verifica esa firma con `verifyEIP712TicketRequest` y se consume su `nonce` en el **Redis
 *     real** (`consumeOnce`), comprobando que el replay se rechaza;
 *   - `ReceptionService.processTicketCheckIn` firma `markCheckedIn` con el **contrato canónico**
 *     (cuenta de recepción), y se verifica en la cadena el evento `CheckedIn` y `isCheckedIn`;
 *   - el **mismo resguardo** se vuelve a presentar: el segundo check-in se rechaza;
 *   - un resguardo nuevo para la misma noche también se rechaza (la noche ya está consumida);
 *   - la cadena rechaza por sí misma un segundo `markCheckedIn` (`AlreadyCheckedIn`);
 *   - la noche consumida **no se puede revender** (`list` → `NightNotResellable`);
 *   - el camino de contingencia se ancla igual, y **rechaza un DNI** sin tocar la cadena;
 *   - el adaptador del PMS no genera ficha policial ni maneja PII.
 *
 * Uso (Anvil en 81234, contrato desplegado, PostgreSQL y Redis levantados):
 *   pnpm test:e2e:m5
 *
 * Escribe la evidencia en `RepoTecnico/evidencias/m5-e2e-anvil.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  CheckInError,
  NFTsRepository,
  NotificationQueueService,
  PmsAdapter,
  QR_REDOWNLOAD_DOMAIN,
  QR_REDOWNLOAD_TYPES,
  ReceptionService,
  RedisTicketUseStore,
  anvilChain,
  closeDbPool,
  closeRedisClient,
  consumeOnce,
  createTicketJWS,
  verifyEIP712TicketRequest,
} from "@hotel/shared";
import { hotelNightsAbi } from "@hotel/shared/abi";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
const evidencePath = resolve(evidenceDir, "m5-e2e-anvil.json");

process.loadEnvFile(resolve(repoRoot, ".env"));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en el entorno (.env de la raíz).`);
  return value;
}

function keyAccount(privateKey: string): PrivateKeyAccount {
  return privateKeyToAccount(privateKey as Hex);
}

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CONTRACT = getAddress(env("CONTRACT_ADDRESS"));

const ACCOUNTS = {
  minter: keyAccount(env("MINTER_RELAYER_PRIVATE_KEY")), // cuenta 1 (MINTER_ROLE)
  reception: keyAccount(env("RECEPTION_WALLET_PRIVATE_KEY")), // cuenta 3 (RECEPTION_ROLE)
  guest: keyAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"), // cuenta 4
} as const;

const ROOM_QR = 105n; // noche del camino QR
const ROOM_CONTINGENCY = 106n; // noche del camino de contingencia
const MINT_PRICE = parseEther("0.11");

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) }) as PublicClient;
const evidence: Record<string, unknown> = {
  hito: "M5",
  premisa: "check-in con markCheckedIn on-chain, resguardo de un solo uso y contingencia sin PII",
  fecha: new Date().toISOString(),
  red: { chainId: anvilChain.id, rpc: RPC_URL, contrato: CONTRACT },
  transacciones: {} as Record<string, string>,
  comprobaciones: [] as string[],
};

function ok(message: string): void {
  (evidence.comprobaciones as string[]).push(message);
  console.log(`  OK  ${message}`);
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Aserción fallida: ${message}`);
  ok(message);
}

function record(name: string, hash: Hex): void {
  (evidence.transacciones as Record<string, string>)[name] = hash;
}

function yyyymmddInDays(days: number): bigint {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return BigInt(date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate());
}

function isoDate(dateYYYYMMDD: bigint): string {
  const raw = dateYYYYMMDD.toString();
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

async function send(
  signer: PrivateKeyAccount,
  tx: { to: Address; data: Hex; value?: bigint },
): Promise<TransactionReceipt> {
  const wallet = createWalletClient({ account: signer, chain: anvilChain, transport: http(RPC_URL) });
  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`La transacción ${hash} revirtió.`);
  return receipt;
}

async function read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
  return publicClient.readContract({
    address: CONTRACT,
    abi: hotelNightsAbi,
    functionName,
    args: args as never,
  }) as Promise<T>;
}

function findEvent(receipt: TransactionReceipt, eventName: string): Record<string, unknown> | null {
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== CONTRACT) continue;
    try {
      const decoded = decodeEventLog({ abi: hotelNightsAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return decoded.args as unknown as Record<string, unknown>;
    } catch {
      // Log de otro evento: se ignora.
    }
  }
  return null;
}

async function expectRevert(
  signer: PrivateKeyAccount,
  request: { functionName: string; args: readonly unknown[]; value?: bigint },
  expectedError: string,
): Promise<void> {
  try {
    await publicClient.simulateContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: request.functionName,
      args: request.args as never,
      value: request.value,
      account: signer,
    });
  } catch (error) {
    const text = errorText(error);
    if (!text.includes(expectedError)) {
      throw new Error(`Se esperaba ${expectedError} en ${request.functionName}; se obtuvo: ${text}`);
    }
    ok(`${request.functionName} revierte con ${expectedError}`);
    return;
  }
  throw new Error(`Se esperaba ${expectedError} en ${request.functionName} y la simulación pasó.`);
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current = error as { message?: string; shortMessage?: string; cause?: unknown } | undefined;
  while (current) {
    if (current.shortMessage) parts.push(current.shortMessage);
    if (current.message) parts.push(current.message);
    current = current.cause as typeof current;
  }
  return parts.join(" | ");
}

/**
 * Primera fecha libre (hoy+30 … hoy+89) para la habitación indicada: el E2E se puede repetir sobre
 * el mismo Anvil sin chocar con `DuplicateNight`. La fecha se toma del **reloj de la cadena**
 * (último bloque), porque el E2E de M6 viaja en el tiempo y `Date.now()` quedaría en el pasado.
 */
async function pickFreeNightDate(room: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const base = new Date(Number(block.timestamp) * 1000);
  for (let offset = 30; offset < 90; offset += 1) {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() + offset);
    const candidate = BigInt(
      date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate(),
    );
    try {
      await read<Address>("ownerOf", [room * 100_000_000n + candidate]);
    } catch {
      return candidate; // `ownerOf` revierte ⇒ la noche no está minteada
    }
  }
  throw new Error(`No queda ninguna fecha libre para la habitación ${room}; reinicia Anvil.`);
}

/** Mintea y compra una noche (deja al huésped como propietario) y siembra la fila del índice. */
async function mintAndBuy(room: bigint, nftsRepo: NFTsRepository): Promise<{ tokenId: bigint; date: bigint }> {
  const date = await pickFreeNightDate(room);
  const tokenId = room * 100_000_000n + date;

  const mintReceipt = await send(ACCOUNTS.minter, {
    to: CONTRACT,
    data: encodeFunctionData({
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [room, date, MINT_PRICE, `ipfs://m5-e2e-${room}`],
    }),
  });
  record(`mint_${room}`, mintReceipt.transactionHash);

  const buyReceipt = await send(ACCOUNTS.guest, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "buy", args: [tokenId] }),
    value: MINT_PRICE,
  });
  record(`buy_${room}`, buyReceipt.transactionHash);

  // Fila del índice off-chain: en producción la escribe el worker a partir del evento `Sale`; aquí
  // se siembra con el repositorio real (el E2E no debe depender de que el worker esté levantado).
  await nftsRepo.upsertNFT({
    tokenId: tokenId.toString(),
    roomNumber: Number(room),
    roomType: "SIMPLE",
    checkInDate: isoDate(date),
    basePriceWei: MINT_PRICE.toString(),
    status: "SOLD",
    currentOwner: ACCOUNTS.guest.address,
    txHashMint: mintReceipt.transactionHash,
    onChainAnchored: true,
  });

  return { tokenId, date };
}

async function main(): Promise<void> {
  console.log(`\n=== E2E M5 real sobre Anvil ${anvilChain.id} — contrato ${CONTRACT} ===`);

  const nftsRepo = new NFTsRepository();
  const notificationQueue = new NotificationQueueService();
  const receptionService = new ReceptionService(
    nftsRepo,
    notificationQueue,
    publicClient,
    createWalletClient({
      account: ACCOUNTS.reception,
      chain: anvilChain,
      transport: http(RPC_URL),
    }),
    {
      nftContractAddress: CONTRACT,
      receptionWalletAddress: ACCOUNTS.reception.address,
      minBalanceNative: 1,
    },
    new RedisTicketUseStore(), // Redis REAL: el uso único también es distribuido
  );

  // 0. Entorno
  expect((await publicClient.getChainId()) === anvilChain.id, "La cadena responde y es la esperada");
  expect(
    Boolean(await publicClient.getBytecode({ address: CONTRACT })),
    "El contrato canónico tiene código desplegado",
  );
  expect(
    await read<boolean>("hasRole", [
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      ACCOUNTS.reception.address,
    ]) === false,
    "Recepción NO es administradora (solo RECEPTION_ROLE): separación de funciones",
  );

  // 1. Camino del resguardo QR: minteo + compra primaria
  const { tokenId: tokenQr, date: dateQr } = await mintAndBuy(ROOM_QR, nftsRepo);
  expect(
    getAddress(await read<Address>("ownerOf", [tokenQr])) === ACCOUNTS.guest.address,
    `La noche ${tokenQr} es del huésped tras la compra primaria`,
  );

  // 2. Autorización EIP-712 del titular (la que exige /api/qr): firma real + consumo del nonce
  const nonce = `m5-${Date.now()}`;
  const signingDomain = {
    ...QR_REDOWNLOAD_DOMAIN,
    chainId: anvilChain.id,
    verifyingContract: CONTRACT,
  };
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 120);
  const signature = await ACCOUNTS.guest.signTypedData({
    domain: signingDomain,
    types: QR_REDOWNLOAD_TYPES,
    primaryType: "DownloadTicket",
    message: { tokenId: tokenQr, nonce, expiresAt },
  });
  expect(
    await verifyEIP712TicketRequest(
      ACCOUNTS.guest.address,
      signature,
      tokenQr,
      nonce,
      expiresAt,
      signingDomain,
    ),
    "La firma EIP-712 del titular valida (es lo que exige el pase)",
  );
  expect(
    (await consumeOnce(`hotel:eip712:ticket:${nonce}`, 120)) === true,
    "El nonce de la autorización se consume una vez (Redis real)",
  );
  expect(
    (await consumeOnce(`hotel:eip712:ticket:${nonce}`, 120)) === false,
    "Reutilizar el mismo nonce se rechaza (replay)",
  );

  // 3. Resguardo JWS (el mismo módulo que usa la API) y check-in real
  const nowSec = Math.floor(Date.now() / 1000);
  const jws = await createTicketJWS({
    tokenId: tokenQr.toString(),
    roomNumber: Number(ROOM_QR),
    checkInDate: isoDate(dateQr),
    roomType: "SIMPLE",
    guestWallet: ACCOUNTS.guest.address,
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
  });

  const checkIn = await receptionService.processTicketCheckIn(jws);
  record("markCheckedIn_onChain", checkIn.onChainTxHash);
  expect(checkIn.status === "CHECKED_IN", `Check-in completado con ancla on-chain (${checkIn.executionTimeMs} ms)`);
  expect(checkIn.onChainAnchor === "BROADCAST", "El ancla on-chain se difundió en el mismo flujo");

  // El servicio devuelve tras DIFUNDIR (SLA de recepción); el E2E espera al recibo para comprobar
  // el efecto en la cadena, que es lo que en producción confirma la mina y indexa el worker.
  const anchorTx = await publicClient.waitForTransactionReceipt({ hash: checkIn.onChainTxHash });
  expect(anchorTx.status === "success", "El recibo del ancla confirma la transacción");
  expect(await read<boolean>("isCheckedIn", [tokenQr]), "La cadena marca la noche como consumida (isCheckedIn)");

  expect(findEvent(anchorTx, "CheckedIn") !== null, "Evento CheckedIn emitido por el contrato canónico");
  const anchorTxRaw = await publicClient.getTransaction({ hash: checkIn.onChainTxHash });
  expect(getAddress(anchorTxRaw.from) === ACCOUNTS.reception.address, "El ancla la firma la hot-wallet de recepción");
  expect(
    anchorTxRaw.input.toLowerCase().startsWith("0x37b30f26"),
    "El calldata del ancla es markCheckedIn(uint256)",
  );

  const persisted = await nftsRepo.getNFTById(tokenQr.toString());
  expect(persisted?.status === "CHECKED_IN", "El índice off-chain queda en CHECKED_IN");

  // 4. El MISMO resguardo otra vez: rechazado (uso único, Redis real)
  const replay = await receptionService
    .processTicketCheckIn(jws)
    .then(() => null)
    .catch((error: unknown) => error);
  expect(replay instanceof CheckInError, "El segundo escaneo del MISMO resguardo falla");
  expect(
    (replay as CheckInError).code === "TICKET_YA_USADO",
    "El segundo escaneo se rechaza con TICKET_YA_USADO (un solo uso)",
  );

  // 5. Un resguardo NUEVO para la misma noche tampoco sirve: la noche ya está consumida
  const freshJws = await createTicketJWS({
    tokenId: tokenQr.toString(),
    roomNumber: Number(ROOM_QR),
    checkInDate: isoDate(dateQr),
    roomType: "SIMPLE",
    guestWallet: ACCOUNTS.guest.address,
    issuedAt: nowSec,
    expiresAt: nowSec + 3600,
  });
  const secondAttempt = await receptionService
    .processTicketCheckIn(freshJws)
    .then(() => null)
    .catch((error: unknown) => error);
  expect(
    secondAttempt instanceof CheckInError && (secondAttempt as CheckInError).code === "YA_CONSUMIDA",
    "Un resguardo nuevo de una noche ya consumida se rechaza con YA_CONSUMIDA",
  );

  // 6. La CADENA es la última puerta: un segundo markCheckedIn revierte
  await expectRevert(
    ACCOUNTS.reception,
    { functionName: "markCheckedIn", args: [tokenQr] },
    "AlreadyCheckedIn",
  );

  // 7. Noche consumida ⇒ no revendible (D-05)
  await expectRevert(ACCOUNTS.guest, { functionName: "list", args: [tokenQr, parseEther("0.2")] }, "NightNotResellable");
  await expectRevert(ACCOUNTS.guest, { functionName: "buyResale", args: [tokenQr], value: 0n }, "NotListed");

  // 8. Contingencia (sin PII): rechazo de un DNI ANTES de tocar la cadena, y ancla con prueba válida
  const { tokenId: tokenContingency, date: dateContingency } = await mintAndBuy(ROOM_CONTINGENCY, nftsRepo);

  const dniAttempt = await receptionService
    .processContingencyCheckIn({
      roomNumber: Number(ROOM_CONTINGENCY),
      checkInDate: isoDate(dateContingency),
      possessionProofType: "VOUCHER_CODE",
      possessionProofValue: "12345678Z",
      reason: "RESGUARDO_IMPRESO",
    })
    .then(() => null)
    .catch((error: unknown) => error);
  expect(
    dniAttempt instanceof CheckInError && (dniAttempt as CheckInError).code === "PRUEBA_POSESION_CON_PII",
    "La contingencia rechaza un DNI (no se admiten datos personales)",
  );
  expect(!(await read<boolean>("isCheckedIn", [tokenContingency])), "El rechazo por PII no consumió la noche");

  // 8b. Un nombre o un teléfono NO pueden pasar como «código de resguardo» (hallazgo de la
  // verificación adversarial: el patrón laxo los aceptaba y los persistía).
  for (const disguised of ["JuanPerezGarcia", "600123456", "12345678"]) {
    const attempt = await receptionService
      .processContingencyCheckIn({
        roomNumber: Number(ROOM_CONTINGENCY),
        checkInDate: isoDate(dateContingency),
        possessionProofType: "VOUCHER_CODE",
        possessionProofValue: disguised,
        reason: "RESGUARDO_IMPRESO",
      })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(attempt instanceof CheckInError, `La contingencia rechaza «${disguised}» como código de resguardo`);
  }
  expect(!(await read<boolean>("isCheckedIn", [tokenContingency])), "Los rechazos no consumieron la noche");

  const contingency = await receptionService.processContingencyCheckIn({
    roomNumber: Number(ROOM_CONTINGENCY),
    checkInDate: isoDate(dateContingency),
    possessionProofType: "WALLET_ADDRESS",
    possessionProofValue: ACCOUNTS.guest.address,
    reason: "SIN_DISPOSITIVO",
  });
  record("markCheckedIn_contingency", contingency.onChainTxHash);
  const contingencyTx = await publicClient.waitForTransactionReceipt({
    hash: contingency.onChainTxHash,
  });
  expect(contingencyTx.status === "success", "El recibo del ancla de contingencia confirma la transacción");
  expect(await read<boolean>("isCheckedIn", [tokenContingency]), "La contingencia ancla el check-in on-chain");
  const contingencyRow = await nftsRepo.getNFTById(tokenContingency.toString());
  expect(contingencyRow?.status === "CHECKED_IN", "El índice off-chain también queda consumido por contingencia");
  await expectRevert(
    ACCOUNTS.guest,
    { functionName: "list", args: [tokenContingency, parseEther("0.2")] },
    "NightNotResellable",
  );

  // 9. PMS: sin ficha policial y sin PII
  const pms = await PmsAdapter.syncCheckIn({
    tokenId: Number(tokenContingency),
    roomNumber: Number(ROOM_CONTINGENCY),
    checkInDate: isoDate(dateContingency),
    checkInMethod: "CONTINGENCY",
  });
  expect(pms.success && pms.policeReportGenerated === false, "El PMS recibe la entrada sin generar ficha policial");
  expect(
    !/document|guestName|traveler|nationality/i.test(JSON.stringify(pms)),
    "La respuesta del PMS no contiene datos personales",
  );

  // 10. Evidencia
  evidence.resultado = "COMPLETO";
  evidence.noches = {
    qr: { tokenId: tokenQr.toString(), room: ROOM_QR.toString(), date: isoDate(dateQr) },
    contingencia: {
      tokenId: tokenContingency.toString(),
      room: ROOM_CONTINGENCY.toString(),
      date: isoDate(dateContingency),
    },
  };
  evidence.precioPrimarioWei = MINT_PRICE.toString();
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  // La cola de BullMQ mantiene una conexión viva: se cierra aquí para que el proceso pueda terminar.
  await notificationQueue.getQueue().close().catch(() => undefined);

  console.log(`\n=== M5 E2E COMPLETO — ${(evidence.comprobaciones as string[]).length} comprobaciones ===`);
  console.log(`Evidencia: ${evidencePath}`);
  for (const [name, hash] of Object.entries(evidence.transacciones as Record<string, string>)) {
    console.log(`  ${name.padEnd(26)} ${hash}`);
  }
  console.log(`  precio primario: ${formatEther(MINT_PRICE)} ETH`);
}

main()
  .then(async () => {
    // Cierre ordenado: el script mantiene abiertos el pool de PostgreSQL, el cliente de Redis y la
    // cola de BullMQ (los mismos que usa el servicio). Sin cerrarlos, el proceso no termina.
    await closeRedisClient().catch(() => undefined);
    await closeDbPool().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(`\nE2E M5 FALLIDO: ${errorText(error) || String(error)}`);
    console.error(error);
    await closeRedisClient().catch(() => undefined);
    await closeDbPool().catch(() => undefined);
    process.exit(1);
  });
