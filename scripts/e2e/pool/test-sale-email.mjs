/**
 * Compra una noche de prueba (cuenta Anvil #5) para disparar el aviso de venta del worker
 * y comprobar que el SMTP de Mailtrap entrega el correo (health.emailDegraded vuelve a false).
 */
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://besu.alumnos.codecrypto.academy";
const HOTEL = "0x8b1B398b9c49AFE6394aaE438f6F2E8039120253";
const KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"; // cuenta 5
const TOKEN = 10720261215n; // simple 104 · 17/11/2026, aún del hotel

const chain = defineChain({ id: 81234, name: "Codecrypto Besu", nativeCurrency: { name: "CC", symbol: "CC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: privateKeyToAccount(KEY), chain, transport: http(RPC) });
const abi = parseAbi([
  "function buy(uint256 tokenId) payable",
  "function priceOf(uint256 tokenId) view returns (uint256)",
  "function soldOnce(uint256 tokenId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

const sold = await pub.readContract({ address: HOTEL, abi, functionName: "soldOnce", args: [TOKEN] });
if (sold) { console.log("La noche ya está vendida, no se dispara venta."); process.exit(0); }
const price = await pub.readContract({ address: HOTEL, abi, functionName: "priceOf", args: [TOKEN] });
console.log("compra", TOKEN.toString(), "precio", price.toString());
const hash = await wallet.writeContract({ address: HOTEL, abi, functionName: "buy", args: [TOKEN], value: price });
await pub.waitForTransactionReceipt({ hash });
const owner = await pub.readContract({ address: HOTEL, abi, functionName: "ownerOf", args: [TOKEN] });
console.log("tx", hash, "owner", owner);
