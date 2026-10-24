/**
 * Verificación on-chain: SOLO el hotel puede abrir subastas de noches.
 *
 * El contrato lo impone por dos vías:
 *   1. `NightAuction.createAuction` exige `AUCTION_ADMIN_ROLE` (solo la wallet del hotel lo tiene).
 *   2. Aunque firme el hotel, la noche debe seguir siendo inventario de la tesorería: la noche de un
 *      huésped (ya vendida) revierte `NightNotHotelInventory`.
 *
 * Se usa `simulateContract` (no se envía ninguna transacción) y se guarda el error decodificado.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://besu.alumnos.codecrypto.academy";
const AUCTION = "0x42E5a852Aa5cd4284227796Bc5d2461189A65b8a";
const GUEST_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"; // cuenta 5
const HOTEL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // cuenta 0

const abi = [
  { type: "function", name: "createAuction", stateMutability: "nonpayable", inputs: [
    { name: "tokenId", type: "uint256" }, { name: "reservePrice", type: "uint256" },
    { name: "startTime", type: "uint64" }, { name: "endTime", type: "uint64" }], outputs: [] },
  { type: "function", name: "AUCTION_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ type: "bool" }] },
];

const chain = defineChain({ id: 81234, name: "Codecrypto Besu", nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const guest = createWalletClient({ account: privateKeyToAccount(GUEST_KEY), chain, transport: http(RPC) });
const hotel = createWalletClient({ account: privateKeyToAccount(HOTEL_KEY), chain, transport: http(RPC) });

const guestAddress = guest.account.address;
const hotelAddress = hotel.account.address;
const block = await pub.getBlock({ blockTag: "latest" });
const start = block.timestamp + 60n;
const end = start + 3600n;
const GUEST_TOKEN = 11620261110n; // noche comprada por la cuenta 5 (no es inventario del hotel)
const role = await pub.readContract({ address: AUCTION, abi, functionName: "AUCTION_ADMIN_ROLE" });
const guestHasRole = await pub.readContract({ address: AUCTION, abi, functionName: "hasRole", args: [role, guestAddress] });
const hotelHasRole = await pub.readContract({ address: AUCTION, abi, functionName: "hasRole", args: [role, hotelAddress] });

/** Motivo decodificado con `cast call` (Besu devuelve el error custom en texto legible). */
function decodedRevertReason(from, tokenId) {
  try {
    return execFileSync(
      "cast",
      ["call", AUCTION, "createAuction(uint256,uint256,uint64,uint64)", tokenId.toString(), "250000000000000000", start.toString(), end.toString(), "--from", from, "--rpc-url", RPC],
      { encoding: "utf8", env: { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` } },
    );
  } catch (error) {
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const match = text.match(/execution reverted: ([^\n]+)/i);
    return match ? match[1].trim() : text.split("\n")[0].trim();
  }
}

async function tryCreate(client, tokenId, label) {
  try {
    await pub.simulateContract({ address: AUCTION, abi, functionName: "createAuction", args: [tokenId, 250000000000000000n, start, end], account: client.account });
    return { label, from: client.account.address, allowed: true, decodedRevertReason: null };
  } catch {
    return { label, from: client.account.address, allowed: false, decodedRevertReason: decodedRevertReason(client.account.address, tokenId) };
  }
}

const result = {
  capturedAt: new Date().toISOString(),
  chainId: 81234,
  auctionContract: AUCTION,
  roles: { guestAddress, hotelAddress, AUCTION_ADMIN_ROLE: role, guestHasRole, hotelHasRole },
  attempts: [
    await tryCreate(guest, GUEST_TOKEN, "huésped intenta abrir subasta de su propia noche"),
    await tryCreate(hotel, GUEST_TOKEN, "hotel intenta subastar una noche que ya es de un huésped"),
  ],
};
const out = process.argv[2] ?? "RepoTecnico/evidencias/e2e-pool-asistente-2026-10-24/flujos/verificacion-solo-hotel-subasta.json";
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
