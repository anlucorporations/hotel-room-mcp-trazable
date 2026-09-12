import { anvilChain, besuChain, CHAIN_ID } from "@hotel/shared";
import { defineChain, type Address, type Chain } from "viem";

/**
 * Configuración de cadena/contrato para el cliente (CU-17). Dirigida por `NEXT_PUBLIC_*`
 * (inyectadas en build); por defecto el proyecto usa la chainId canónica (81234, espejo de
 * Besu). En dev se puede apuntar a otra Anvil local (p. ej. 31337) vía `NEXT_PUBLIC_CHAIN_ID`.
 */
const DEV_CONTRACT: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const rpcUrl: string = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const contractAddress: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined) ?? DEV_CONTRACT;

export const marketplaceAddress: Address =
  (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS as Address | undefined) ?? contractAddress;

/**
 * Faucet de pruebas (RF-21, ADR-13): `null` si no se configura `NEXT_PUBLIC_FAUCET_ADDRESS`.
 * En producción NO se define (no hay faucet) y en el E2E hermético tampoco, por lo que toda
 * la UI de faucet queda oculta sin tocar más nada (retrocompatibilidad). Solo en dev/test se
 * inyecta la dirección que escribió `Deploy.s.sol` y propagó `sync-deployment.ts`.
 */
export const faucetAddress: Address | null =
  (process.env.NEXT_PUBLIC_FAUCET_ADDRESS as Address | undefined) ?? null;

/**
 * Bloque de despliegue: punto de inicio del escaneo de `getLogs` (fuente única, ADR-09).
 *
 * MINOR#16 — Un valor 0 SOLO es válido para Anvil/CI recién levantados (el contrato vive en
 * los primeros bloques). En cadenas reales escanear desde 0 multiplica los chunks y puede
 * saturar el RPC, así que fuera de `development` se advierte (sin romper el demo: env=0 en dev
 * sigue funcionando). Se documenta vía aviso en lugar de fail-fast para no tumbar previews.
 */
export const deploymentBlock: bigint = BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ?? "0");

if (process.env.NODE_ENV !== "development" && deploymentBlock === 0n) {
  console.warn(
    "[chain] NEXT_PUBLIC_DEPLOYMENT_BLOCK=0 fuera de desarrollo: el escaneo de getLogs " +
      "arrancará en el bloque 0 (válido solo para Anvil/CI). Configura el bloque real de " +
      "despliegue del contrato para reducir chunks y evitar saturar el RPC.",
  );
}

const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? CHAIN_ID);

/**
 * Explorador de bloques (opcional). Las redes locales (Anvil/Besu privada) no tienen
 * explorador, así que por defecto queda sin definir y el recibo degrada honestamente a
 * hash acortado + copiar (UX#2/#13). En una red con explorador, configúralo vía
 * `NEXT_PUBLIC_BLOCK_EXPLORER_URL` y el recibo mostrará el enlace «Ver transacción».
 */
const explorerUrl = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/+$/, "");
const blockExplorers: Chain["blockExplorers"] = explorerUrl
  ? { default: { name: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_NAME ?? "Explorador", url: explorerUrl } }
  : undefined;

function resolveChain(): Chain {
  const base =
    process.env.NEXT_PUBLIC_NETWORK === "besu"
      ? besuChain
      : envChainId === CHAIN_ID
        ? anvilChain
        : // Dev sobre otra chainId local (p. ej. 31337, la de Anvil por defecto).
          defineChain({
            id: envChainId,
            name: `Anvil dev (${envChainId})`,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } },
          });
  // Solo añadimos `blockExplorers` si hay uno configurado (degradación honesta sin él).
  return blockExplorers ? { ...base, blockExplorers } : base;
}

export const activeChain: Chain = resolveChain();

/** URL del explorador para una tx, o `null` si la red no tiene explorador configurado. */
export function txExplorerUrl(hash: `0x${string}`): string | null {
  const url = activeChain.blockExplorers?.default?.url;
  return url ? `${url}/tx/${hash}` : null;
}
