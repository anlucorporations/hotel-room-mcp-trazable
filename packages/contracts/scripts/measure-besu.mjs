/**
 * Medición de aceptación en Besu (FASE 5, TC-ACC-010/011/012).
 *
 *   - TC-ACC-010: intervalo entre bloques  → P50 ≤ 3 s, P95 ≤ 6 s.
 *   - TC-ACC-011: latencia de lectura RPC  → P95 ≤ 400 ms.
 *   - TC-ACC-012: 0 eventos perdidos       → getLogs(Transfer mint) == nº minteado esperado.
 *
 * Solo lectura (no envía transacciones). Indicador de aceptación; imprime PASS/FAIL por métrica.
 *
 * Env: RPC_URL, CONTRACT_ADDRESS, DEPLOYMENT_BLOCK, EXPECTED_MINTS (def. 12), SAMPLES (def. 40).
 */
import { createPublicClient, http, parseAbi } from "viem";

const RPC_URL = process.env.RPC_URL ?? "https://besu1.proyectos.codecrypto.academy";
const CONTRACT = process.env.CONTRACT_ADDRESS;
const DEPLOYMENT_BLOCK = BigInt(process.env.DEPLOYMENT_BLOCK ?? "0");
const EXPECTED_MINTS = Number(process.env.EXPECTED_MINTS ?? "12");
const SAMPLES = Number(process.env.SAMPLES ?? "40");
const BLOCK_WINDOW = Number(process.env.BLOCK_WINDOW ?? "50");

if (!CONTRACT) {
  console.error("Falta CONTRACT_ADDRESS");
  process.exit(2);
}

const abi = parseAbi([
  "function priceOf(uint256 tokenId) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const client = createPublicClient({ transport: http(RPC_URL) });

/** Percentil p (0..1) de un array numérico (método nearest-rank). */
function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

const ms = (x) => `${x.toFixed(1)} ms`;
const verdict = (ok) => (ok ? "PASS" : "FAIL");

async function timed(fn) {
  const t0 = performance.now();
  const value = await fn();
  return { value, dt: performance.now() - t0 };
}

async function measureBlockTime() {
  const head = await client.getBlockNumber();
  const start = head - BigInt(BLOCK_WINDOW) > 0n ? head - BigInt(BLOCK_WINDOW) : 0n;
  const timestamps = [];
  for (let b = start; b <= head; b++) {
    const blk = await client.getBlock({ blockNumber: b });
    timestamps.push(Number(blk.timestamp));
  }
  const deltas = [];
  for (let i = 1; i < timestamps.length; i++) deltas.push(timestamps[i] - timestamps[i - 1]);
  return deltas;
}

async function measureRpcLatency() {
  const latencies = { blockNumber: [], call: [], getLogs: [] };
  // tokenId de la primera noche del seed (hab 101, 2026-06-15) para priceOf.
  const tokenId = 101n * 100_000_000n + 20260615n;
  for (let i = 0; i < SAMPLES; i++) {
    latencies.blockNumber.push((await timed(() => client.getBlockNumber())).dt);
    latencies.call.push(
      (await timed(() => client.readContract({ address: CONTRACT, abi, functionName: "priceOf", args: [tokenId] }))).dt,
    );
    latencies.getLogs.push(
      (await timed(() =>
        client.getLogs({ address: CONTRACT, event: abi[1], args: { from: "0x0000000000000000000000000000000000000000" }, fromBlock: DEPLOYMENT_BLOCK, toBlock: "latest" }),
      )).dt,
    );
  }
  return latencies;
}

async function measureEventIntegrity() {
  const logs = await client.getLogs({
    address: CONTRACT,
    event: abi[1],
    args: { from: "0x0000000000000000000000000000000000000000" },
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock: "latest",
  });
  return logs.length;
}

(async () => {
  console.log(`\n=== Medición de aceptación Besu (${RPC_URL}) ===`);
  console.log(`Contrato ${CONTRACT} · bloque de despliegue ${DEPLOYMENT_BLOCK}\n`);

  // TC-ACC-010
  const deltas = await measureBlockTime();
  const bP50 = percentile(deltas, 0.5);
  const bP95 = percentile(deltas, 0.95);
  const blockOk = bP50 <= 3 && bP95 <= 6;
  console.log(`TC-ACC-010 intervalo de bloque (${deltas.length} muestras): P50=${bP50}s P95=${bP95}s · objetivo P50≤3s/P95≤6s → ${verdict(blockOk)}`);

  // TC-ACC-011
  const lat = await measureRpcLatency();
  const rows = Object.entries(lat).map(([k, v]) => ({ k, p50: percentile(v, 0.5), p95: percentile(v, 0.95) }));
  const worstP95 = Math.max(...rows.map((r) => r.p95));
  const rpcOk = worstP95 <= 400;
  for (const r of rows) console.log(`TC-ACC-011 RPC ${r.k.padEnd(12)} P50=${ms(r.p50)} P95=${ms(r.p95)}`);
  console.log(`TC-ACC-011 latencia RPC peor P95=${ms(worstP95)} · objetivo P95≤400ms → ${verdict(rpcOk)}`);

  // TC-ACC-012
  const minted = await measureEventIntegrity();
  const eventsOk = minted === EXPECTED_MINTS;
  console.log(`TC-ACC-012 eventos de mint indexables: ${minted} · esperados ${EXPECTED_MINTS} (0 perdidos) → ${verdict(eventsOk)}`);

  const allOk = blockOk && rpcOk && eventsOk;
  console.log(`\nRESULTADO GLOBAL: ${verdict(allOk)}\n`);
  process.exit(allOk ? 0 : 1);
})().catch((e) => {
  console.error("Error en la medición:", e);
  process.exit(2);
});
