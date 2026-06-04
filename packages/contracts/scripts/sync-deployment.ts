/**
 * Sincroniza el registro de despliegue hacia `packages/shared/deployments/<chainId>.json`
 * (DISEÑO §14): toma `{address, deploymentBlock}` que escribió el script de Foundry y le
 * añade el `abiHash` calculado desde el artefacto compilado.
 *
 * Ejecutar tras `forge script ... --broadcast` (ver `scripts/smoke-deploy.sh`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, stringToBytes } from "viem";
import { deploymentSchema } from "@hotel/shared";

const contractsDir = process.cwd();
const latestPath = resolve(contractsDir, "deployments/latest.json");
const artifactPath = resolve(contractsDir, "out/HotelNights.sol/HotelNights.json");
const sharedDeploymentsDir = resolve(contractsDir, "..", "shared", "deployments");

interface LatestDeployment {
  chainId: number;
  address: string;
  deploymentBlock: number;
}

interface BroadcastTransaction {
  transactionType: string;
  contractName?: string;
  contractAddress?: string;
  hash: string;
}
interface BroadcastReceipt {
  transactionHash: string;
  blockNumber: string;
}
interface Broadcast {
  transactions: BroadcastTransaction[];
  receipts: BroadcastReceipt[];
}

const latest = JSON.parse(readFileSync(latestPath, "utf8")) as LatestDeployment;
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown[] };

/**
 * El recibo del broadcast es la fuente fiable de la dirección y el bloque de creación; la
 * simulación del script reporta `block.number` antes del broadcast (puede ser 0). Si no hay
 * broadcast (p. ej. dry-run), se usa `latest.json`.
 */
function resolveFromBroadcast(): { address: string; deploymentBlock: number } | null {
  const broadcastPath = resolve(
    contractsDir,
    `broadcast/Deploy.s.sol/${latest.chainId}/run-latest.json`,
  );
  try {
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8")) as Broadcast;
    const createTx = broadcast.transactions.find(
      (tx) => tx.transactionType === "CREATE" && tx.contractName === "HotelNights",
    );
    if (!createTx?.contractAddress) return null;
    const receipt = broadcast.receipts.find(
      (r) => r.transactionHash === createTx.hash,
    );
    if (!receipt) return null;
    return {
      address: createTx.contractAddress,
      deploymentBlock: Number(BigInt(receipt.blockNumber)),
    };
  } catch {
    return null;
  }
}

const onChain = resolveFromBroadcast();
// Fingerprint del ABI del artefacto compilado (no un hash canónico): sirve para detectar
// cambios de la interfaz entre despliegues. Depende del formato del artefacto de Foundry.
const abiHash = keccak256(stringToBytes(JSON.stringify(artifact.abi)));

const deployment = deploymentSchema.parse({
  chainId: latest.chainId,
  address: onChain?.address ?? latest.address,
  deploymentBlock: onChain?.deploymentBlock ?? latest.deploymentBlock,
  abiHash,
  deployedAt: new Date().toISOString(),
});

mkdirSync(sharedDeploymentsDir, { recursive: true });
const outPath = resolve(sharedDeploymentsDir, `${deployment.chainId}.json`);
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`✓ Despliegue sincronizado → ${outPath}`);
console.log(`  address=${deployment.address} block=${deployment.deploymentBlock}`);
console.log(`  abiHash=${deployment.abiHash}`);
