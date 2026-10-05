/**
 * Verificación puntual (2026-10-05): el backend habla con el **Anvil desplegado en GCP**.
 * Lee del contrato real y compara con lo que ve el índice off-chain. Solo lectura.
 */
import { createPublicClient, http, parseAbi } from "viem";

const RPC = process.env.RPC_URL ?? "https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app";
const ADDRESS = (process.env.CONTRACT_ADDRESS ?? "0xc66ab83418c20a65c3f8e83b3d11c8c3a6097b6f") as `0x${string}`;

const abi = parseAbi([
  "function isRoomRegistered(uint256 room) view returns (bool)",
  "function nextTokenId() view returns (uint256)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
]);

const client = createPublicClient({ transport: http(RPC) });

const [chainId, blockNumber, clientVersion] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
  client.request({ method: "web3_clientVersion" } as never).catch(() => "?"),
]);

console.log(`rpc            : ${RPC}`);
console.log(`chainId        : ${chainId}`);
console.log(`cliente        : ${clientVersion}`);
console.log(`altura         : ${blockNumber}`);

const code = await client.getBytecode({ address: ADDRESS });
console.log(`contrato       : ${ADDRESS} · ${code ? (code.length - 2) / 2 : 0} bytes de bytecode`);

const reads = [
  ["paused()", "paused"],
  ["owner()", "owner"],
  ["nextTokenId()", "nextTokenId"],
] as const;
for (const [label, functionName] of reads) {
  try {
    const value = await client.readContract({ address: ADDRESS, abi, functionName: functionName as never });
    console.log(`${label.padEnd(14)} : ${String(value)}`);
  } catch (error) {
    console.log(`${label.padEnd(14)} : no disponible (${(error as Error).message.slice(0, 60)})`);
  }
}

const rooms = [101, 102, 110, 201, 301, 401, 999];
const registered: string[] = [];
for (const room of rooms) {
  const isRegistered = await client.readContract({ address: ADDRESS, abi, functionName: "isRoomRegistered", args: [BigInt(room)] });
  registered.push(`${room}:${isRegistered ? "sí" : "no"}`);
}
console.log(`registradas    : ${registered.join(" · ")}`);
