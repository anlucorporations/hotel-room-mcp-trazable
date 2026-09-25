/**
 * E2E REAL del hito M4 (D-07) contra Anvil: compra **primaria** y **reventa** operativas, cada
 * una con su calldata construido, re-verificado contra el precio on-chain y firmado como el
 * MISMO objeto byte a byte, más el retiro del vendedor con `claim()`.
 *
 * A diferencia de `scripts/e2e/amoy-lifecycle.ts` (marcado como FALSO en la auditoría por
 * imprimir `OK` sin firmar nada), este script **firma y envía transacciones reales** y termina
 * con código de salida ≠ 0 si cualquier aserción falla: no existe una ruta que imprima éxito sin
 * evidencia.
 *
 * Fuente de verdad del calldata: el módulo compartido `@hotel/shared/domain`, el MISMO que usa la
 * web (`buildPurchaseTxData` → `verifyPurchaseTx` → firma de los bytes verificados). Esa identidad
 * es la premisa de D-07 y aquí se comprueba on-chain: se lee la transacción minada y se compara su
 * `input` byte a byte con el calldata que se había verificado.
 *
 * Uso (con Anvil en 81234 y el contrato desplegado):
 *   pnpm test:e2e:m4        (desde la raíz del monorepo)
 *
 * Escribe la evidencia (hashes, importes, direcciones) en
 * `RepoTecnico/evidencias/m4-e2e-anvil.json`.
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
  anvilChain,
  buildPurchaseTxData,
  decodePurchaseTx,
  verifyPurchaseTx,
} from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const evidenceDir = resolve(repoRoot, "RepoTecnico", "evidencias");
const evidencePath = resolve(evidenceDir, "m4-e2e-anvil.json");

// El entorno local vive en el `.env` de la raíz del monorepo (igual que worker/mcp/monitor).
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
const TREASURY = getAddress(process.env.TREASURY_ADDRESS ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
const DEPLOYER = keyAccount(env("DEPLOYER_PRIVATE_KEY"));

/**
 * Cuentas del entorno de Anvil. Las de los compradores son claves de desarrollo publicadas por
 * Anvil (cuentas 4 y 5): no son secretos y por eso no viven en `.env`.
 */
const ACCOUNTS = {
  minter: keyAccount(env("MINTER_RELAYER_PRIVATE_KEY")), // cuenta 1 (MINTER_ROLE)
  reception: keyAccount(env("RECEPTION_WALLET_PRIVATE_KEY")), // cuenta 3 (RECEPTION_ROLE)
  buyer: keyAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"), // cuenta 4
  secondBuyer: keyAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"), // cuenta 5
} as const;

const ROOM = 102n; // habitación simple: royalty 5 % (D-06)
const MINT_PRICE = parseEther("0.1");
const RESALE_PRICE = parseEther("0.2");

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) }) as PublicClient;

/** Hashes y cifras que se documentan como evidencia del hito. */
const evidence: Record<string, unknown> = {
  hito: "M4",
  premisa: "compra primaria y reventa operativas con el calldata verificado y firmado (D-07)",
  fecha: new Date().toISOString(),
  red: { chainId: anvilChain.id, rpc: RPC_URL, contrato: CONTRACT, treasury: TREASURY },
  noches: { room: ROOM.toString(), mintPriceWei: MINT_PRICE.toString(), resalePriceWei: RESALE_PRICE.toString() },
  transacciones: {} as Record<string, string>,
  comprobaciones: [] as string[],
};

function yyyymmddInDays(days: number): bigint {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return BigInt(
    date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate(),
  );
}

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

/** Evento del contrato decodificado desde el recibo; `null` si no aparece. */
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

/** Firma y envía una transacción con la cuenta indicada, esperando el recibo. */
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

/**
 * Primera fecha libre dentro de la ventana del catálogo (hoy+30 … hoy+89) para la habitación de
 * prueba. Así el E2E se puede repetir sobre el mismo Anvil sin chocar con `DuplicateNight`.
 *
 * La fecha se calcula con el **reloj de la cadena** (último bloque), no con el de la máquina: otros
 * E2E (M6) viajan en el tiempo para caducar noches, y un mint calculado con `Date.now()` revertiría
 * con `PastDate` después de ese viaje.
 */
async function pickFreeNightDate(): Promise<bigint> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  for (let offset = 30; offset < 90; offset += 1) {
    const date = chainYyyymmdd(offset, Number(block.timestamp) * 1000);
    try {
      await read<Address>("ownerOf", [ROOM * 100_000_000n + date]);
    } catch {
      return date; // `ownerOf` revierte ⇒ la noche no está minteada
    }
  }
  throw new Error(
    `No queda ninguna fecha libre para la habitación ${ROOM} en 60 días; reinicia Anvil y vuelve a desplegar.`,
  );
}

/** Fecha `AAAAMMDD` a `days` días de la referencia (reloj de la cadena). */
function chainYyyymmdd(days: number, chainNowMs: number): bigint {
  const date = new Date(chainNowMs);
  date.setUTCDate(date.getUTCDate() + days);
  return BigInt(
    date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate(),
  );
}

/** Comprueba que una llamada revierte con el error canónico esperado (sin gastar gas). */
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
 * Verifica el calldata EXACTAMENTE como lo hace la web antes de firmar y lo envía después.
 * Falla si lo revisado y lo firmado difiriesen un solo byte.
 */
async function verifiedPurchase(params: {
  signer: PrivateKeyAccount;
  tokenId: bigint;
  saleType: "PRIMARY" | "SECONDARY";
  expectedPriceWei: bigint;
  label: string;
}): Promise<TransactionReceipt> {
  const tx = buildPurchaseTxData({
    tokenId: params.tokenId,
    priceWei: params.expectedPriceWei,
    saleType: params.saleType,
    contractAddress: CONTRACT,
    chainId: anvilChain.id,
  });

  // 1) Módulo compartido: verificación independiente contra el precio on-chain (RNF-19).
  const verification = verifyPurchaseTx({
    tx,
    expectedTokenId: params.tokenId,
    expectedPriceWei: params.expectedPriceWei,
    expectedContract: CONTRACT,
    expectedChainId: anvilChain.id,
  });
  if (!verification.ok) {
    throw new Error(`Verificación fallida (${params.label}): ${verification.reasons.join(", ")}`);
  }
  const decoded = decodePurchaseTx(tx.data);
  expect(
    decoded.functionName === (params.saleType === "PRIMARY" ? "buy" : "buyResale"),
    `${params.label}: el calldata verificado llama a ${decoded.functionName}`,
  );

  // 2) Firma y envío del objeto verificado (mismo `to`/`data`/`value`).
  const receipt = await send(params.signer, { to: tx.to, data: tx.data, value: BigInt(tx.value) });
  record(params.label, receipt.transactionHash);

  // 3) Prueba on-chain byte a byte: lo minado es exactamente el `data` verificado.
  const mined = await publicClient.getTransaction({ hash: receipt.transactionHash });
  expect(
    mined.input.toLowerCase() === tx.data.toLowerCase(),
    `${params.label}: el calldata minado es idéntico byte a byte al verificado (${tx.data.length / 2 - 1} bytes)`,
  );
  expect(getAddress(mined.to ?? "0x") === CONTRACT, `${params.label}: destino = contrato canónico`);
  expect(mined.value === BigInt(tx.value), `${params.label}: value = precio verificado`);

  return receipt;
}

async function main(): Promise<void> {
  console.log(`\n=== E2E M4 real sobre Anvil ${anvilChain.id} — contrato ${CONTRACT} ===`);

  const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

  // 0. Entorno: la cadena responde, el contrato existe y la gobernanza es la esperada.
  const chainId = await publicClient.getChainId();
  expect(chainId === anvilChain.id, `La cadena responde y es la esperada (${chainId})`);
  const code = await publicClient.getBytecode({ address: CONTRACT });
  expect(Boolean(code && code !== "0x"), "El contrato canónico HotelNights tiene código desplegado");
  expect(
    await read<boolean>("hasRole", [ADMIN_ROLE, ACCOUNTS.minter.address]),
    "El admin definitivo tiene DEFAULT_ADMIN_ROLE",
  );
  expect(
    !(await read<boolean>("hasRole", [ADMIN_ROLE, DEPLOYER.address])),
    "El EOA desplegador ya no es administrador (handover de gobernanza)",
  );

  // 1. MINT: el hotel pone la noche en inventario (MINTER_ROLE, cuenta 1).
  const nightDate = await pickFreeNightDate();
  (evidence.noches as Record<string, string>).dateYYYYMMDD = nightDate.toString();
  const tokenId = ROOM * 100_000_000n + nightDate;
  const mintReceipt = await send(ACCOUNTS.minter, {
    to: CONTRACT,
    data: encodeFunctionData({
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [ROOM, nightDate, MINT_PRICE, "ipfs://m4-e2e"],
    }),
  });
  record("mint", mintReceipt.transactionHash);
  const mintEvent = findEvent(mintReceipt, "Mint");
  expect(mintEvent?.tokenId === tokenId, `Mint emitido para el tokenId ${tokenId}`);
  expect(String(mintEvent?.roomType) === "simple", "La noche minteada es de tipo simple (royalty 5 %)");

  // 2. COMPRA PRIMARIA (cuenta 4): calldata `buy(tokenId)` verificado y firmado.
  const primaryPrice = await read<bigint>("priceOf", [tokenId]);
  expect(primaryPrice === MINT_PRICE, `priceOf = ${formatEther(primaryPrice)} ETH`);
  const treasuryBefore = await publicClient.getBalance({ address: TREASURY });
  const buyReceipt = await verifiedPurchase({
    signer: ACCOUNTS.buyer,
    tokenId,
    saleType: "PRIMARY",
    expectedPriceWei: primaryPrice,
    label: "buyPrimary",
  });
  expect(
    getAddress(await read<Address>("ownerOf", [tokenId])) === ACCOUNTS.buyer.address,
    "Tras la primaria, la dueña es la compradora",
  );
  expect(Number(findEvent(buyReceipt, "Sale")?.saleType) === 0, "Evento Sale con saleType PRIMARY (0)");
  const treasuryAfter = await publicClient.getBalance({ address: TREASURY });
  expect(treasuryAfter - treasuryBefore === primaryPrice, "La tesorería recibe el 100 % de la primaria");
  expect(await read<boolean>("soldOnce", [tokenId]), "La noche queda marcada como vendida al menos una vez");

  // 3. LISTADO de reventa (la propietaria): `list(tokenId, price)`.
  const minListingPrice = await read<bigint>("minListingPrice", []);
  expect(
    RESALE_PRICE > minListingPrice,
    `El precio de reventa supera el suelo de ${formatEther(minListingPrice)} ETH`,
  );
  const listReceipt = await send(ACCOUNTS.buyer, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "list", args: [tokenId, RESALE_PRICE] }),
  });
  record("list", listReceipt.transactionHash);
  const listing = await read<{ price: bigint; active: boolean }>("listingOf", [tokenId]);
  expect(listing.active && listing.price === RESALE_PRICE, `Listado activo por ${formatEther(listing.price)} ETH`);
  expect(findEvent(listReceipt, "Listed") !== null, "Evento Listed emitido");

  // 3b. CANCELAR el listado (`unlist`, el hook del propietario) y volver a listarlo: el estado
  // autoritativo del mercado secundario (`listingOf.active`) tiene que seguirlo con exactitud.
  const unlistReceipt = await send(ACCOUNTS.buyer, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "unlist", args: [tokenId] }),
  });
  record("unlist", unlistReceipt.transactionHash);
  expect(
    !(await read<{ price: bigint; active: boolean }>("listingOf", [tokenId])).active,
    "Tras `unlist` el listado deja de estar activo (no se ofrece en la vista secundaria)",
  );
  const relistReceipt = await send(ACCOUNTS.buyer, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "list", args: [tokenId, RESALE_PRICE] }),
  });
  record("relist", relistReceipt.transactionHash);
  expect(
    (await read<{ price: bigint; active: boolean }>("listingOf", [tokenId])).active,
    "El nuevo listado vuelve a estar activo tras `list` (mismo precio)",
  );

  // 4. REVENTA (cuenta 5): calldata `buyResale(tokenId)` verificado y firmado.
  const royalty = await read<[Address, bigint]>("royaltyInfo", [tokenId, RESALE_PRICE]);
  expect(royalty[1] === RESALE_PRICE / 20n, `Royalty del 5 % = ${formatEther(royalty[1])} ETH`);
  const sellerPendingBefore = await read<bigint>("pendingWithdrawals", [ACCOUNTS.buyer.address]);
  const treasuryPendingBefore = await read<bigint>("pendingWithdrawals", [TREASURY]);
  const resaleReceipt = await verifiedPurchase({
    signer: ACCOUNTS.secondBuyer,
    tokenId,
    saleType: "SECONDARY",
    expectedPriceWei: RESALE_PRICE,
    label: "buyResale",
  });
  expect(
    getAddress(await read<Address>("ownerOf", [tokenId])) === ACCOUNTS.secondBuyer.address,
    "Tras la reventa, la dueña es la segunda compradora",
  );
  expect(Number(findEvent(resaleReceipt, "Sale")?.saleType) === 1, "Evento Sale con saleType SECONDARY (1)");
  expect(findEvent(resaleReceipt, "RoyaltyPaid") !== null, "Evento RoyaltyPaid emitido");
  const sellerPending = await read<bigint>("pendingWithdrawals", [ACCOUNTS.buyer.address]);
  // DELTA, no valor absoluto: la vendedora puede arrastrar saldos pendientes de ejecuciones
  // anteriores en la misma cadena (nunca cobra en este E2E), y entonces la comparación absoluta
  // fallaba por estado acumulado y no por un defecto. Mismo patrón que la tesorería, dos líneas más
  // abajo (M8, hallazgo al re-ejecutar la familia completa de E2E).
  expect(
    sellerPending - sellerPendingBefore === RESALE_PRICE - royalty[1],
    `Saldo pendiente de la vendedora = ${formatEther(sellerPending - sellerPendingBefore)} ETH (precio − royalty)`,
  );
  expect(
    (await read<bigint>("pendingWithdrawals", [TREASURY])) - treasuryPendingBefore === royalty[1],
    "La tesorería acumula el royalty como saldo pendiente",
  );
  expect(
    !(await read<{ price: bigint; active: boolean }>("listingOf", [tokenId])).active,
    "El listado queda cerrado tras la reventa (no revendible dos veces)",
  );

  // 5. CLAIM: la vendedora retira su saldo (pull-over-push, ADR-15).
  const balanceBefore = await publicClient.getBalance({ address: ACCOUNTS.buyer.address });
  const claimReceipt = await send(ACCOUNTS.buyer, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "claim" }),
  });
  record("claim", claimReceipt.transactionHash);
  const gasCost = claimReceipt.gasUsed * claimReceipt.effectiveGasPrice;
  const balanceAfter = await publicClient.getBalance({ address: ACCOUNTS.buyer.address });
  expect(
    balanceAfter - balanceBefore + gasCost === sellerPending,
    `La retirada paga el saldo pendiente exacto (${formatEther(sellerPending)} ETH) descontando el gas`,
  );
  expect(
    (await read<bigint>("pendingWithdrawals", [ACCOUNTS.buyer.address])) === 0n,
    "El saldo pendiente de la vendedora queda a cero",
  );

  // 6. Guardas: el contrato rechaza lo que la vista secundaria no debe ofrecer.
  await expectRevert(
    ACCOUNTS.secondBuyer,
    { functionName: "buy", args: [tokenId], value: primaryPrice },
    "NightNotAvailable",
  );
  await expectRevert(
    ACCOUNTS.secondBuyer,
    { functionName: "buyResale", args: [tokenId], value: RESALE_PRICE },
    "NotListed",
  );
  await expectRevert(
    ACCOUNTS.secondBuyer,
    { functionName: "list", args: [tokenId, minListingPrice - 1n] },
    "PriceBelowMinimum",
  );
  // `claim` sin saldo pendiente debe revertir con `NoFunds`. Para que la comprobación no dependa de
  // que la cuenta esté «virgen», se drena primero lo que pudiera arrastrar de ejecuciones anteriores
  // (esta E2E comparte cuentas fijas de Anvil y la cadena no se reinicia entre pasadas; M8).
  const pendingBeforeDrain = await read<bigint>("pendingWithdrawals", [ACCOUNTS.secondBuyer.address]);
  if (pendingBeforeDrain > 0n) {
    await send(ACCOUNTS.secondBuyer, {
      to: CONTRACT,
      data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "claim", args: [] }),
    });
  }
  await expectRevert(ACCOUNTS.secondBuyer, { functionName: "claim", args: [] }, "NoFunds");

  // 7. La noche consumida deja de ser revendible (D-05): base del filtro de la vista secundaria.
  const checkInReceipt = await send(ACCOUNTS.reception, {
    to: CONTRACT,
    data: encodeFunctionData({ abi: hotelNightsAbi, functionName: "markCheckedIn", args: [tokenId] }),
  });
  record("markCheckedIn", checkInReceipt.transactionHash);
  expect(await read<boolean>("isCheckedIn", [tokenId]), "La noche queda marcada como consumida (check-in on-chain)");
  await expectRevert(
    ACCOUNTS.secondBuyer,
    { functionName: "list", args: [tokenId, RESALE_PRICE] },
    "NightNotResellable",
  );

  // 8. Evidencia en disco y resumen.
  evidence.resultado = "COMPLETO";
  evidence.tokenId = tokenId.toString();
  evidence.royaltyWei = royalty[1].toString();
  evidence.vendedorPendienteWei = sellerPending.toString();
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(`\n=== M4 E2E COMPLETO — habitación ${ROOM}, noche ${nightDate} ===`);
  console.log(`Evidencia: ${evidencePath}`);
  for (const [name, hash] of Object.entries(evidence.transacciones as Record<string, string>)) {
    console.log(`  ${name.padEnd(14)} ${hash}`);
  }
}

main().catch((error: unknown) => {
  console.error(`\nE2E M4 FALLIDO: ${errorText(error) || String(error)}`);
  process.exitCode = 1;
});
