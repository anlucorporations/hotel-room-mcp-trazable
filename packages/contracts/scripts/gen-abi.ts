/**
 * Codegen del ABI tipado hacia `packages/shared/src/abi` (DISEÑO §14). Lo consumen web y
 * worker con inferencia de tipos de viem (`as const`). Ejecutar tras `forge build`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const contractsDir = process.cwd();
const sharedAbiDir = resolve(contractsDir, "..", "shared", "src", "abi");

function readAbi(contract: string): unknown[] {
  const path = resolve(contractsDir, `out/${contract}.sol/${contract}.json`);
  const artifact = JSON.parse(readFileSync(path, "utf8")) as { abi: unknown[] };
  return artifact.abi;
}

function writeAbiModule(file: string, exportName: string, contract: string): void {
  const abi = readAbi(contract);
  const content =
    `// Generado por scripts/gen-abi.ts — NO editar a mano.\n` +
    `// Fuente: packages/contracts/out/${contract}.sol/${contract}.json\n\n` +
    `export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;\n`;
  writeFileSync(resolve(sharedAbiDir, file), content);
  console.log(`✓ ${exportName} → packages/shared/src/abi/${file}`);
}

mkdirSync(sharedAbiDir, { recursive: true });
writeAbiModule("hotel-nights.ts", "hotelNightsAbi", "HotelNights");
writeAbiModule("faucet.ts", "faucetAbi", "Faucet");
