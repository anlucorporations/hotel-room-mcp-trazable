import { loginAdmin, listRooms, publishForDate } from "./lib/publish.mjs";
import { tokenIdFor, tokenExists } from "./lib/chain.mjs";

/**
 * Noches EXCLUSIVAS del pool de conversaciones (no se compran: solo se preguntan al asistente).
 * 15 noches = 3 por cuenta, en fechas distintas dentro de los próximos 2 meses.
 */
export const POOL_PLAN = [
  { roomNumber: 104, date: "2026-11-17" },
  { roomNumber: 118, date: "2026-11-20" },
  { roomNumber: 213, date: "2026-11-23" },
  { roomNumber: 105, date: "2026-11-26" },
  { roomNumber: 119, date: "2026-11-28" },
  { roomNumber: 214, date: "2026-12-02" },
  { roomNumber: 106, date: "2026-12-04" },
  { roomNumber: 120, date: "2026-12-07" },
  { roomNumber: 215, date: "2026-12-13" },
  { roomNumber: 107, date: "2026-12-15" },
  { roomNumber: 121, date: "2026-12-17" },
  { roomNumber: 216, date: "2026-12-21" },
  { roomNumber: 108, date: "2026-12-23" },
  { roomNumber: 122, date: "2026-12-24" },
  { roomNumber: 217, date: "2026-12-22" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const session = await loginAdmin();
  const rooms = await listRooms(session);
  const byNumber = new Map(rooms.map((room) => [room.roomNumber, room]));
  for (const entry of POOL_PLAN) {
    const room = byNumber.get(entry.roomNumber);
    if (!room) throw new Error(`Habitación ${entry.roomNumber} no encontrada`);
    const tokenId = tokenIdFor(entry.roomNumber, entry.date);
    if (await tokenExists(tokenId)) { console.log("SKIP", entry.roomNumber, entry.date); continue; }
    for (let intento = 0; intento < 6; intento++) {
      const res = await publishForDate(session, [room.id], entry.date);
      if (res.status === 202 || res.status === 200) { console.log("QUEUE", entry.roomNumber, entry.date); break; }
      if (res.status === 429) { await sleep((Number(res.json?.retryAfter ?? 10) + 2) * 1000); continue; }
      console.log("WAIT", entry.roomNumber, entry.date, res.status, res.json?.results?.[0]?.error ?? res.json?.error);
      await sleep(12_000);
    }
    const deadline = Date.now() + 120_000;
    let minted = false;
    while (Date.now() < deadline) { if (await tokenExists(tokenId)) { minted = true; break; } await sleep(4000); }
    console.log(minted ? "MINTED" : "PENDIENTE", tokenId.toString());
    await sleep(2500);
  }
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });
