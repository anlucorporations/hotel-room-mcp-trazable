/**
 * Seed de DEMO sobre Anvil: mintea un surtido de noches (varios tipos y fechas) para que el
 * catálogo tenga contenido al probar la app como cliente. No compra nada (eso lo hace el
 * usuario en el navegador). Requiere Anvil + contrato desplegado (ver demo).
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, buildNightMetadata, roomTypeOf } from "@hotel/shared";
import { faucetAbi, hotelNightsAbi } from "@hotel/shared/abi";
import { tryReadDeployment } from "@hotel/shared/deployments";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN = Number(process.env.CHAIN_ID ?? CHAIN_ID);
const CONTRACT = (process.env.CONTRACT_ADDRESS ??
  "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Address;
// Anvil cuenta #1 (MINTER tras el bootstrap del deploy).
const MINTER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const chain = defineChain({
  id: CHAIN,
  name: `Anvil (${CHAIN})`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const minter = createWalletClient({
  account: privateKeyToAccount(MINTER_PK),
  chain,
  transport: http(RPC),
});

const publicClient = createPublicClient({ chain, transport: http(RPC) });

const PRICE = { simple: "0.05", doble: "0.1", suite: "0.3" } as const;

function dateInDays(offset: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// Surtido: simples (101–115), dobles (116–130), suites (201–220), en fechas próximas.
const ROOMS = [101, 105, 112, 118, 124, 129, 202, 207, 213, 218, 220, 110];

/**
 * Verifica que el faucet de pruebas (RF-21) quedó desplegado y financiado para el demo.
 * El despliegue y la financiación los hace `Deploy.s.sol` (DEPLOY_FAUCET=true por defecto) y
 * su dirección viaja al registro `deployments/<chainId>.json` vía `sync-deployment.ts`. Aquí
 * solo confirmamos el estado y avisamos al operador si falta saldo, sin desplegar nada (SRP).
 */
async function checkFaucet(): Promise<void> {
  const deployment = tryReadDeployment(CHAIN);
  const faucet = deployment?.faucet as Address | undefined;
  if (!faucet) {
    console.warn(
      `⚠ Sin faucet en el registro de la chain ${CHAIN}. Despliega con DEPLOY_FAUCET=true ` +
        `y ejecuta \`pnpm sync\` para que la web pueda ofrecer ETH de prueba (RF-21).`,
    );
    return;
  }

  const [balance, amount, low] = await Promise.all([
    publicClient.getBalance({ address: faucet }),
    publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: "amount" }),
    publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: "lowBalance" }),
  ]);

  console.log(`faucet ${faucet} saldo=${formatEther(balance)} ETH (dispensa ${formatEther(amount)} ETH)`);
  if (balance < amount) {
    console.warn("⚠ El faucet no tiene saldo para una dispensación. Recárgalo con `fund()`/transferencia.");
  } else if (low) {
    console.warn("⚠ El faucet está por debajo del umbral de saldo bajo (RNF-17). Conviene recargarlo.");
  }
}

async function main(): Promise<void> {
  let minted = 0;
  for (let i = 0; i < ROOMS.length; i++) {
    const room = ROOMS[i]!;
    const type = roomTypeOf(room);
    if (!type) continue;
    const dateYYYYMMDD = dateInDays(7 + i * 2); // del día +7 en adelante
    const metadata = buildNightMetadata({ room, dateYYYYMMDD, roomType: type });
    const uri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata))}`;

    const hash = await minter.writeContract({
      address: CONTRACT,
      abi: hotelNightsAbi,
      functionName: "mint",
      args: [BigInt(room), BigInt(dateYYYYMMDD), parseEther(PRICE[type]), uri],
    });
    console.log(`mint hab ${room} (${type}) ${dateYYYYMMDD} → ${hash.slice(0, 10)}…`);
    minted += 1;
  }
  console.log(`\n✅ ${minted} noches minteadas. Abre la tienda y pruébala.`);

  await checkFaucet();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
