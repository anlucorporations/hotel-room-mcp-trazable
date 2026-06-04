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

/** Bloque de despliegue: punto de inicio del escaneo de `getLogs` (fuente única, ADR-09). */
export const deploymentBlock: bigint = BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ?? "0");

const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? CHAIN_ID);

function resolveChain(): Chain {
  if (process.env.NEXT_PUBLIC_NETWORK === "besu") return besuChain;
  if (envChainId === CHAIN_ID) return anvilChain;
  // Dev sobre otra chainId local (p. ej. 31337, la de Anvil por defecto).
  return defineChain({
    id: envChainId,
    name: `Anvil dev (${envChainId})`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export const activeChain: Chain = resolveChain();
