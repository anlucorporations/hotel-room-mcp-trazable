import { loginAdmin, listRooms, publishForDate } from "./lib/publish.mjs";
import { PUBLISH_PLAN } from "./publish-plan.mjs";
import { tokenIdFor, tokenExists } from "./lib/chain.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reintenta una operación ante 429 del WAF respetando `retryAfter`. */
async function withRetry(fn, { attempts = 6, label = "" } = {}) {
  for (let i = 0; i < attempts; i++) {
    const res = await fn();
    if (res.status !== 429) return res;
    const wait = Number(res.json?.retryAfter ?? 12) * 1000 + 1500;
    console.log(`  [429] ${label} → espero ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
  throw new Error(`rate limit persistente en ${label}`);
}

/** Espera a que una noche minteada exista on-chain (el worker procesa el job en segundo plano). */
async function waitMinted(tokenId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tokenExists(tokenId)) return true;
    await sleep(4000);
  }
  return false;
}

async function main() {
  const session = await loginAdmin();
  const rooms = await listRooms(session);
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));

  for (const entry of PUBLISH_PLAN) {
    const room = byNumber.get(entry.roomNumber);
    if (!room) throw new Error(`Habitación ${entry.roomNumber} no encontrada`);
    for (const date of entry.dates) {
      const tokenId = tokenIdFor(entry.roomNumber, date);
      if (await tokenExists(tokenId)) {
        console.log(`SKIP  ${entry.roomNumber} ${date} (ya minteada)`);
        continue;
      }
      let ok = false;
      for (let intento = 1; intento <= 4 && !ok; intento++) {
        const res = await withRetry(
          () => publishForDate(session, [room.id], date),
          { label: `publish ${entry.roomNumber} ${date}` },
        );
        const result = res.json?.results?.[0];
        if (res.status === 202 || res.status === 200) {
          ok = true;
          console.log(`QUEUE ${entry.roomNumber} ${entry.type} ${date} → job ${result?.jobId ?? "?"}`);
        } else if (result?.error === "INTERNAL_SERVER_ERROR") {
          // Job activo de otra fecha: se espera y se reintenta.
          console.log(`WAIT  ${entry.roomNumber} ${date} (job activo previo, intento ${intento})`);
          await sleep(12_000);
        } else {
          console.log(`FAIL  ${entry.roomNumber} ${date}`, res.status, JSON.stringify(res.json?.results?.[0] ?? res.json));
          break;
        }
      }
      if (ok) {
        const minted = await waitMinted(tokenId);
        console.log(`  ${minted ? "MINTED" : "PENDIENTE"} ${tokenId}`);
      }
      await sleep(2500);
    }
  }
}

main().catch((error) => {
  console.error("ERROR", error);
  process.exit(1);
});
