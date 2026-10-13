import { anvilChain, besuChain, CHAIN_ID } from "@hotel/shared/domain";
import { defineChain, type Address, type Chain } from "viem";

/**
 * Configuración de cadena/contrato para el cliente (CU-17, docs/SRS.md §9). Dirigida por `NEXT_PUBLIC_*`
 * (inyectadas en build). La **red del proyecto es Besu** (testnet de Codecrypto, `chainId 81234`): si
 * el RPC configurado es remoto, el cliente usa `besuChain`. En desarrollo/CI el RPC es local
 * (Anvil, arrancado con el mismo `chainId` para que nada dependa de la red) y se usa `anvilChain`;
 * `NEXT_PUBLIC_NETWORK=anvil` fuerza ese modo también con un RPC remoto.
 */
const DEV_CONTRACT: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const rpcUrl: string = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

export const contractAddress: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as Address | undefined) ?? DEV_CONTRACT;

/**
 * NOTA (D-07): aquí vivía la dirección del marketplace de la generación legacy y su variable
 * de entorno. Se retiró junto con su ABI: existe un único destino posible para comprar,
 * revender y cobrar —`contractAddress` (`HotelNights`)— y un guardián de pruebas
 * (`legacy-target-guardian.test.ts`) impide que vuelva a colarse un segundo destino.
 */

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

/**
 * ¿El RPC es una red **local de desarrollo**? Misma regla que el worker, el MCP y el monitor: la
 * red del proyecto es **Besu** y Anvil solo es el espejo local (ambos con `chainId 81234`), así que
 * la cadena se distingue por la URL del RPC y no por el `chainId`, que es compartido.
 */
export function isLocalRpc(url: string): boolean {
  return url.includes("127.0.0.1") || url.includes("localhost");
}

function resolveChain(): Chain {
  const base: Chain =
    process.env.NEXT_PUBLIC_NETWORK === "anvil" || isLocalRpc(rpcUrl)
      ? // Desarrollo/CI: Anvil local con el chainId canónico (espejo de Besu).
        { ...anvilChain, rpcUrls: { default: { http: [rpcUrl] } } }
      : envChainId === CHAIN_ID
        ? // Red del proyecto: Besu de Codecrypto.
          { ...besuChain, rpcUrls: { default: { http: [rpcUrl] } } }
        : // Otra red EVM declarada por entorno (p. ej. Polygon en una fase posterior).
          defineChain({
            id: envChainId,
            name: `Red EVM (${envChainId})`,
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
