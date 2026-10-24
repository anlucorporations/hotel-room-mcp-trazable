import { loginAdmin, listRooms, publishForDate } from "./lib/publish.mjs";
import { tokenIdFor, tokenExists } from "./lib/chain.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 10 noches de suite adicionales para las 10 subastas del pool (2 por cuenta). */
export const AUCTION_PLAN = [
  { roomNumber: 203, date: "2026-11-19" },
  { roomNumber: 204, date: "2026-11-22" },
  { roomNumber: 205, date: "2026-11-25" },
  { roomNumber: 206, date: "2026-11-30" },
  { roomNumber: 207, date: "2026-12-03" },
  { roomNumber: 208, date: "2026-12-06" },
  { roomNumber: 209, date: "2026-12-09" },
  { roomNumber: 210, date: "2026-12-11" },
  { roomNumber: 211, date: "2026-12-16" },
  { roomNumber: 212, date: "2026-12-19" },
];

async function main() {
  const session = await loginAdmin();
  const rooms = await listRooms(session);
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  for (const entry of AUCTION_PLAN) {
    const room = byNumber.get(entry.roomNumber);
    if (!room) throw new Error(`Habitación ${entry.roomNumber} no encontrada`);
    const tokenId = tokenIdFor(entry.roomNumber, entry.date);
    if (await tokenExists(tokenId)) {
      console.log("SKIP", entry.roomNumber, entry.date);
      continue;
    }
    for (let intento = 0; intento < 5; intento++) {
      const res = await publishForDate(session, [room.id], entry.date);
      const result = res.json?.results?.[0];
      if (res.status === 202 || res.status === 200) {
        console.log("QUEUE", entry.roomNumber, entry.date, result?.jobId);
        break;
      }
      if (res.status === 429) {
        await sleep((Number(res.json?.retryAfter ?? 10) + 2) * 1000);
        continue;
      }
      console.log("WAIT", entry.roomNumber, entry.date, res.status, result?.error ?? res.json?.error);
      await sleep(12_000);
    }
    const deadline = Date.now() + 120_000;
    let minted = false;
    while (Date.now() < deadline) {
      if (await tokenExists(tokenId)) { minted = true; break; }
      await sleep(4000);
    }
    console.log(minted ? "MINTED" : "PENDIENTE", tokenId.toString());
    await sleep(2500);
  }
}

main().catch((error) => { console.error("ERROR", error); process.exit(1); });
