import { anvilChain, besuChain } from "@hotel/shared";
import type { Address, Chain } from "viem";

/**
 * Configuración de cadena/contrato para el cliente (CU-17). Los valores `NEXT_PUBLIC_*` se
 * inyectan en build; en dev caen a Anvil con la dirección determinista del primer deploy.
 */
const DEV_CONTRACT: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const activeChain: Chain =
  process.env.NEXT_PUBLIC_NETWORK === "besu" ? besuChain : anvilChain;

export const rpcUrl: string = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const contractAddress: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined) ?? DEV_CONTRACT;
