/* eslint-disable no-console */
/**
 * Verificación on-chain (on-demand) del reporte
 *   «al hacer una reserva la wallet da la transacción por fallida, pero la plataforma la agrega a Mis noches».
 *
 * No forma parte de la suite hermética: necesita un nodo Anvil y despliega su propio contrato.
 * Usa el contrato **real** (`HotelNights`), las **mismas** librerías del cliente (viem + el
 * contenedor de wagmi que usa `useWaitForTransactionReceipt`) y el **mismo** código de la app
 * (`buildPurchaseTxData`, `verifiedTxRequest`, `deriveTxStatus`). Comprueba:
 *
 *   A) Una compra que REVIERTE: la cadena la marca `reverted`, wagmi la reporta como error,
 *      `deriveTxStatus` la clasifica `reverted`, NO emite `Sale` y NO cambia `ownerOf`.
 *      ⇒ no puede aparecer en «Mis noches» (que es exactamente `Sale(buyer)` + `ownerOf`).
 *   B) Una compra CONFIRMADA: `success` → `confirmed`, emite `Sale(buyer)`, `ownerOf` es el
 *      comprador y SÍ aparece en «Mis noches».
 *   C) Reintento sobre una noche ya vendida: revierte y tampoco aparece.
 *
 * Uso:
 *   anvil --port 8545 --chain-id 81234        # terminal aparte
 *   pnpm --filter @hotel/web exec tsx scripts/verify-reserva-fallida.mts
 *
 * Escribe la evidencia en `RepoTecnico/evidencias/<AAAA-MM-DD>/verificacion-reserva-fallida.json`
 * (override con `EVIDENCE_DIR`). Termina con código ≠ 0 si alguna aserción falla.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  toHex,
  parseEther,
  decodeEventLog,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConfig } from "wagmi";
import { waitForTransactionReceipt as wagmiWait } from "wagmi/actions";
import { buildPurchaseTxData } from "@hotel/shared/domain";
import { hotelNightsAbi } from "@hotel/shared/abi";
import { deriveTxStatus } from "../src/components/tx/txStatus";
import { verifiedTxRequest } from "../src/components/buy/verifiedTxRequest";

const here = resolve(import.meta.dirname ?? ".");
const repoRoot = resolve(here, "..", "..", "..");
const artifact = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/contracts/out/HotelNights.sol/HotelNights.json"), "utf8"),
) as { bytecode: { object: Hex } };

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chain = defineChain({
  id: Number(process.env.CHAIN_ID ?? 81234),
  name: "anvil",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const deployer = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const buyer = privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a");
const pub = createPublicClient({ chain, transport: http(RPC) });
const walletOf = (account: typeof deployer) => createWalletClient({ account, chain, transport: http(RPC) });

const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));
const ROOM = 999n;
const DATE = 20261220n;
const PRICE = parseEther("0.1");
let deployed: Address;
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`✓ ${label}`);
  } else {
    failures += 1;
    console.error(`✗ ${label}`, detail ?? "");
  }
}

async function rawSend(account: typeof deployer, tx: { to: Address; data: Hex; value: bigint }): Promise<Hex> {
  const fees = await pub.estimateFeesPerGas();
  const signed = await account.signTransaction({
    ...tx,
    gas: 300_000n,
    nonce: await pub.getTransactionCount({ address: account.address }),
    chainId: chain.id,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    type: "eip1559",
  });
  return pub.sendRawTransaction({ serializedTransaction: signed });
}

/** Fuente de datos de «Mis noches»: `Sale` con buyer + `ownerOf` (igual que `useMyNights`). */
async function appearsInMyNights(tokenId: bigint, walletAddress: Address) {
  const head = await pub.getBlockNumber();
  const saleAbi = hotelNightsAbi.find((item) => item.type === "event" && item.name === "Sale");
  const sales = await pub.getLogs({
    address: deployed,
    event: saleAbi as never,
    args: { buyer: walletAddress },
    fromBlock: 0n,
    toBlock: head,
  });
  const candidateFromSale = sales.some((log) => (log.args as { tokenId?: bigint }).tokenId === tokenId);
  let ownerIsWallet = false;
  try {
    const owner = (await pub.readContract({
      address: deployed,
      abi: hotelNightsAbi,
      functionName: "ownerOf",
      args: [tokenId],
    })) as Address;
    ownerIsWallet = owner.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    ownerIsWallet = false;
  }
  return { candidateFromSale, ownerIsWallet, appears: candidateFromSale && ownerIsWallet };
}

/** Estado que la UI deriva del recibo (idéntico a `useBuyNight` + `deriveTxStatus`). */
async function uiStatusFor(hash: Hex) {
  const wagmiConfig = createConfig({ chains: [chain], transports: { [chain.id]: http(RPC) }, connectors: [] });
  let receiptIsSuccess = false;
  let receiptIsError = false;
  let reason = "";
  try {
    await wagmiWait(wagmiConfig, { hash });
    receiptIsSuccess = true;
  } catch (error) {
    receiptIsError = true;
    reason = error instanceof Error ? error.message : String(error);
  }
  const status = deriveTxStatus({
    isPending: false,
    hash,
    isConfirming: false,
    isConfirmed: receiptIsSuccess,
    isReverted: receiptIsError,
  });
  return { receiptIsSuccess, receiptIsError, status, reason };
}

const evidence: Record<string, unknown> = {
  what: "verificación de «tx fallida pero la noche aparece en Mis noches»",
  chainId: chain.id,
  rpc: RPC,
  room: ROOM.toString(),
  dateYYYYMMDD: DATE.toString(),
  priceWei: PRICE.toString(),
};

// ── Despliegue + habitación + noches ───────────────────────────────────────────
const deployReceipt = await pub.waitForTransactionReceipt({
  hash: await walletOf(deployer).deployContract({
    abi: hotelNightsAbi,
    bytecode: artifact.bytecode.object,
    args: [deployer.address],
  }),
});
deployed = deployReceipt.contractAddress!;
evidence.contract = deployed;

for (const step of [
  { functionName: "grantRole", args: [MINTER_ROLE, deployer.address] },
  { functionName: "registerRoom", args: [ROOM, "simple"] },
] as const) {
  await pub.waitForTransactionReceipt({
    hash: await walletOf(deployer).writeContract({ address: deployed, abi: hotelNightsAbi, ...step }),
  });
}
const mint = async (date: bigint): Promise<bigint> => {
  await pub.waitForTransactionReceipt({
    hash: await walletOf(deployer).writeContract({
      address: deployed,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [ROOM, date, PRICE, "ipfs://verify"],
    }),
  });
  return ROOM * 100_000_000n + date;
};
const T1 = await mint(DATE);
const T2 = await mint(DATE + 1n);
evidence.tokens = { T1: T1.toString(), T2: T2.toString() };

const buildTx = (tokenId: bigint) =>
  verifiedTxRequest(
    buildPurchaseTxData({ tokenId, priceWei: PRICE, saleType: "PRIMARY", contractAddress: deployed, chainId: chain.id }),
    deployed,
  );

// ── A) Compra que revierte (pago incorrecto) ───────────────────────────────────
const failed = buildTx(T1);
const hashFail = await rawSend(buyer, { to: failed.to, data: failed.data, value: failed.value - 1n });
const receiptFail = await pub.waitForTransactionReceipt({ hash: hashFail });
const uiFail = await uiStatusFor(hashFail);
const myNightsFail = await appearsInMyNights(T1, buyer.address);
const ownerT1 = (await pub.readContract({ address: deployed, abi: hotelNightsAbi, functionName: "ownerOf", args: [T1] })) as Address;

evidence.failedBuy = {
  hash: hashFail,
  onChainReceiptStatus: receiptFail.status,
  wagmiThrew: uiFail.receiptIsError,
  wagmiMessage: uiFail.reason,
  deriveTxStatus: uiFail.status,
  ownerOf: ownerT1,
  ownerIsTreasury: ownerT1.toLowerCase() === deployer.address.toLowerCase(),
  appearsInMyNights: myNightsFail,
};
check("A · la cadena marca la tx como revertida", receiptFail.status === "reverted", receiptFail.status);
check("A · wagmi rechaza el recibo (la app lo ve como error)", uiFail.receiptIsError);
check("A · deriveTxStatus = reverted (nunca confirmed)", uiFail.status === "reverted", uiFail.status);
check("A · no emite Sale / no cambia ownerOf", !myNightsFail.candidateFromSale && myNightsFail.ownerIsWallet === false);
check("A · NO aparece en «Mis noches»", myNightsFail.appears === false, myNightsFail);

// ── B) Compra confirmada ───────────────────────────────────────────────────────
const ok = buildTx(T2);
const hashOk = await rawSend(buyer, { to: ok.to, data: ok.data, value: ok.value });
const receiptOk = await pub.waitForTransactionReceipt({ hash: hashOk });
const uiOk = await uiStatusFor(hashOk);
const myNightsOk = await appearsInMyNights(T2, buyer.address);
const saleLog = receiptOk.logs
  .map((log) => {
    try {
      return decodeEventLog({ abi: hotelNightsAbi, data: log.data, topics: log.topics });
    } catch {
      return null;
    }
  })
  .find((decoded) => decoded?.eventName === "Sale");
const ownerT2 = (await pub.readContract({ address: deployed, abi: hotelNightsAbi, functionName: "ownerOf", args: [T2] })) as Address;
evidence.confirmedBuy = {
  hash: hashOk,
  onChainReceiptStatus: receiptOk.status,
  deriveTxStatus: uiOk.status,
  saleEventEmitted: Boolean(saleLog),
  saleBuyer: (saleLog?.args as { buyer?: string } | undefined)?.buyer ?? null,
  ownerOf: ownerT2,
  ownerIsBuyer: ownerT2.toLowerCase() === buyer.address.toLowerCase(),
  appearsInMyNights: myNightsOk,
};
check("B · la cadena marca la tx como success", receiptOk.status === "success", receiptOk.status);
check("B · deriveTxStatus = confirmed", uiOk.status === "confirmed", uiOk.status);
check("B · emite Sale con buyer = comprador", Boolean(saleLog) && ownerT2.toLowerCase() === buyer.address.toLowerCase());
check("B · SÍ aparece en «Mis noches»", myNightsOk.appears === true, myNightsOk);

// ── C) Reintento sobre la noche ya vendida ─────────────────────────────────────
const again = buildTx(T2);
const hashAgain = await rawSend(deployer, { to: again.to, data: again.data, value: again.value });
const receiptAgain = await pub.waitForTransactionReceipt({ hash: hashAgain });
const uiAgain = await uiStatusFor(hashAgain);
const myNightsAgain = await appearsInMyNights(T2, deployer.address);
evidence.secondBuyAfterSold = {
  hash: hashAgain,
  onChainReceiptStatus: receiptAgain.status,
  deriveTxStatus: uiAgain.status,
  appearsInMyNights: myNightsAgain,
};
check("C · el reintento revierte", receiptAgain.status === "reverted");
check("C · deriveTxStatus = reverted", uiAgain.status === "reverted");
check("C · la noche no aparece para el segundo comprador", myNightsAgain.appears === false);

const day = new Date().toISOString().slice(0, 10);
const outDir = process.env.EVIDENCE_DIR ?? resolve(repoRoot, `RepoTecnico/evidencias/verificacion-${day}`);
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "verificacion-reserva-fallida.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nevidence -> ${outPath}`);
if (failures > 0) {
  console.error(`\n✗ ${failures} aserción(es) fallaron.`);
  process.exit(1);
}
console.log("\n✅ PASS: una compra revertida no llega a «Mis noches»; solo la confirmada.");
