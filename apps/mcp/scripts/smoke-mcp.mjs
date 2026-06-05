/* eslint-disable no-console -- script CLI de smoke: la salida por consola es intencionada. */
/**
 * Smoke de integración del MCP por HTTP (transporte Streamable) contra el Anvil del demo.
 * Verifica las 4 herramientas end-to-end (aceptación "Anvil" de TC-MCP-001/002/003/008).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { verifyPurchaseTx } from "@hotel/shared";

const URL_MCP = new URL(process.env.MCP_URL ?? "http://127.0.0.1:8788/mcp");
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

const parse = (r) => JSON.parse(r.content[0].text);

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(URL_MCP));

const tools = await client.listTools();
console.log("herramientas:", tools.tools.map((t) => t.name).join(", "));

const list = parse(await client.callTool({ name: "listAvailableNights", arguments: {} }));
console.log(`listAvailableNights → ${list.length} noches comprables`);
const sample = list[0];
if (!sample) throw new Error("no hay noches comprables para el smoke (¿corriste el seed?)");
console.log("  muestra:", sample);

const ca = parse(
  await client.callTool({
    name: "checkAvailability",
    arguments: { room: sample.room, date: sample.dateYYYYMMDD },
  }),
);
console.log("checkAvailability →", ca);
if (!ca.exists || !ca.available) throw new Error("la muestra debería existir y ser comprable");

const tx = parse(await client.callTool({ name: "buildPurchaseTx", arguments: { tokenId: sample.tokenId } }));
console.log("buildPurchaseTx →", tx);
const v = verifyPurchaseTx({
  tx,
  expectedTokenId: BigInt(sample.tokenId),
  expectedPriceWei: BigInt(sample.priceWei),
  expectedContract: CONTRACT,
  expectedChainId: CHAIN_ID,
});
if (!v.ok) throw new Error("la tx no verifica: " + v.reasons.join(", "));
console.log("✅ tx verificada (to/value/chainId/selector/tokenId) — sin firma");

// Guardrail estructural: el MCP no expone ninguna herramienta de firma/custodia.
const names = tools.tools.map((t) => t.name);
const forbidden = names.filter((n) => /sign|send|transfer|privateKey|wallet.*sign/i.test(n));
if (forbidden.length) throw new Error("el MCP expone herramientas de firma: " + forbidden.join(", "));
console.log("✅ el MCP no expone herramientas de firma ni custodia (RF-12)");

await client.close();
console.log("\n✅ SMOKE MCP OK");
