import fs from "node:fs";
import path from "node:path";
import { pub, auctionAbi, AUCTION_ADDRESS, HOTEL_ADDRESS, hotelAbi } from "../../../apps/web/e2e/pool/flow-lib.mjs";

const OUT = process.argv[2] ?? "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24/flujos/estado-cadena.json";
const accounts = [
  ["cuenta-5", "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"],
  ["cuenta-6", "0x976EA74026E726554dB657fA54763abd0C3a0aa9"],
  ["cuenta-7", "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"],
  ["cuenta-8", "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"],
  ["cuenta-9", "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"],
];
const tokens = [
  "11620261110","11720261112","20120261114","20220261116","11620261124","11720261127","20120261129","20220261201",
  "11620261208","11720261210","20120261212","20220261214","11620261220","11720261222","20120261223",
  "20320261119","20420261122","20520261125","20620261130","20720261203","20820261206","20920261209","21020261211","21120261216","21220261219",
];
const out = { capturedAt: new Date().toISOString(), chainId: 81234, contract: HOTEL_ADDRESS, auction: AUCTION_ADDRESS, accounts: {}, tokens: {} };
for (const [name, address] of accounts) {
  const balance = await pub.getBalance({ address });
  const owned = [];
  for (const id of tokens) {
    try {
      const owner = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "ownerOf", args: [BigInt(id)] });
      if (owner.toLowerCase() === address.toLowerCase()) owned.push(id);
    } catch { /* token inexistente */ }
  }
  out.accounts[name] = { address, balanceWei: balance.toString(), balanceCC: (Number(balance) / 1e18).toFixed(4), owned };
}
for (const id of tokens) {
  const t = BigInt(id);
  try {
    const owner = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "ownerOf", args: [t] });
    const sold = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "soldOnce", args: [t] });
    const checked = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "isCheckedIn", args: [t] });
    const listing = await pub.readContract({ address: HOTEL_ADDRESS, abi: hotelAbi, functionName: "listingOf", args: [t] });
    out.tokens[id] = { owner, soldOnce: sold, checkedIn: checked, listed: listing[1], listingPriceWei: listing[0].toString() };
  } catch { out.tokens[id] = null; }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log("ESTADO", OUT);
console.log(JSON.stringify(out.accounts, null, 1));
