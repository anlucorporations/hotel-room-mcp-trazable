/**
 * Sincroniza el registro de despliegue hacia `packages/shared/deployments/<chainId>.json`
 * (ADR-09): toma `{address, deploymentBlock}` que escribieron los scripts de Foundry y les
 * añade el `abiHash` calculado desde el artefacto compilado.
 *
 * Cubre los DOS contratos del runtime:
 *   · `HotelNights` (canónico, D-02) → campos de primer nivel del registro.
 *   · `HotelOperations` (vNext · F2)  → bloque `operations`, opcional y retrocompatible.
 *
 * Ejecutar tras `forge script ... --broadcast` (ver `scripts/smoke-deploy.sh` y
 * `scripts/smoke-operations.sh`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, stringToBytes } from "viem";
import { deploymentSchema, type OperationsDeployment } from "@hotel/shared";

const contractsDir = process.cwd();
const latestPath = resolve(contractsDir, "deployments/latest.json");
const latestOperationsPath = resolve(contractsDir, "deployments/latest-operations.json");
const sharedDeploymentsDir = resolve(contractsDir, "..", "shared", "deployments");

interface LatestDeployment {
  chainId: number;
  address: string;
  deploymentBlock: number;
  // Solo presente cuando el deploy desplegó el faucet de pruebas (DEPLOY_FAUCET=true).
  faucet?: string;
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

/** `{address, deploymentBlock}` fiables del recibo del broadcast, o `null` si no hay broadcast. */
function resolveFromBroadcast(
  scriptFile: string,
  contractName: string,
  chainId: number,
): { address: string; deploymentBlock: number } | null {
  const broadcastPath = resolve(
    contractsDir,
    `broadcast/${scriptFile}/${chainId}/run-latest.json`,
  );
  try {
    const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8")) as Broadcast;
    const createTx = broadcast.transactions.find(
      (tx) => tx.transactionType === "CREATE" && tx.contractName === contractName,
    );
    if (!createTx?.contractAddress) return null;
    const receipt = broadcast.receipts.find((r) => r.transactionHash === createTx.hash);
    if (!receipt) return null;
    return {
      address: createTx.contractAddress,
      deploymentBlock: Number(BigInt(receipt.blockNumber)),
    };
  } catch {
    return null;
  }
}

/**
 * Fingerprint del ABI del artefacto compilado (no un hash canónico): sirve para detectar cambios de
 * la interfaz entre despliegues. Depende del formato del artefacto de Foundry.
 */
function abiHashOf(contractName: string): string {
  const artifactPath = resolve(contractsDir, `out/${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown[] };
  return keccak256(stringToBytes(JSON.stringify(artifact.abi)));
}

/** Bloque `operations` (F2), o `undefined` si esa cadena aún no tiene `HotelOperations`. */
function resolveOperations(chainId: number): OperationsDeployment | undefined {
  if (!existsSync(latestOperationsPath)) return undefined;
  const latest = JSON.parse(readFileSync(latestOperationsPath, "utf8")) as LatestDeployment;
  if (latest.chainId !== chainId) {
    console.warn(
      `⚠ deployments/latest-operations.json es de la cadena ${latest.chainId}; se ignora (registro de ${chainId}).`,
    );
    return undefined;
  }
  const onChain = resolveFromBroadcast("DeployOperations.s.sol", "HotelOperations", chainId);
  return {
    address: onChain?.address ?? latest.address,
    deploymentBlock: onChain?.deploymentBlock ?? latest.deploymentBlock,
    abiHash: abiHashOf("HotelOperations"),
  };
}

const latest = JSON.parse(readFileSync(latestPath, "utf8")) as LatestDeployment;
const onChain = resolveFromBroadcast("Deploy.s.sol", "HotelNights", latest.chainId);

const deployment = deploymentSchema.parse({
  chainId: latest.chainId,
  address: onChain?.address ?? latest.address,
  deploymentBlock: onChain?.deploymentBlock ?? latest.deploymentBlock,
  abiHash: abiHashOf("HotelNights"),
  deployedAt: new Date().toISOString(),
  // El faucet (RF-21) solo se propaga si el deploy lo escribió. Zod descarta `undefined`,
  // así que el registro de producción (sin faucet) queda igual que antes (retrocompat).
  faucet: latest.faucet,
  // El contrato de operaciones (F2) solo aparece si se desplegó en esta cadena.
  operations: resolveOperations(latest.chainId),
});

mkdirSync(sharedDeploymentsDir, { recursive: true });
const outPath = resolve(sharedDeploymentsDir, `${deployment.chainId}.json`);
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`✓ Despliegue sincronizado → ${outPath}`);
console.log(`  address=${deployment.address} block=${deployment.deploymentBlock}`);
console.log(`  abiHash=${deployment.abiHash}`);
if (deployment.faucet) console.log(`  faucet=${deployment.faucet}`);
if (deployment.operations) {
  console.log(
    `  operations=${deployment.operations.address} block=${deployment.operations.deploymentBlock}`,
  );
  console.log(`  operations.abiHash=${deployment.operations.abiHash}`);
} else {
  console.log("  operations=(sin desplegar en esta cadena)");
}
