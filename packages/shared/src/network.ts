import { defineChain } from "viem";
import {
  ANVIL_RPC_URL,
  BESU_RPC_URL,
  BESU_RPC_URL_FALLBACK,
  CHAIN_ID,
  CURRENCY_DECIMALS,
  CURRENCY_SYMBOL,
  NETWORK_NAME,
} from "./constants";

/**
 * Configuración de red para viem/wagmi (ADR-17).
 *
 * `baseFee = 0` en Besu ⇒ los consumidores deben construir transacciones con fees
 * explícitos (`FEE_MODE`); no usar la auto-estimación EIP-1559.
 *
 * Anvil de desarrollo se arranca con `--chain-id 81234` para reflejar Besu; por eso ambas
 * cadenas comparten `CHAIN_ID`.
 */
const nativeCurrency = {
  name: "Ether",
  symbol: CURRENCY_SYMBOL,
  decimals: CURRENCY_DECIMALS,
} as const;

export const besuChain = defineChain({
  id: CHAIN_ID,
  name: NETWORK_NAME,
  nativeCurrency,
  // El failover real requiere un `fallback([...])` transport en el cliente viem; aquí el
  // segundo RPC queda declarado para que los consumidores lo configuren (no es automático).
  rpcUrls: {
    default: { http: [BESU_RPC_URL, BESU_RPC_URL_FALLBACK] },
  },
});

export const anvilChain = defineChain({
  id: CHAIN_ID,
  name: `${NETWORK_NAME} (Anvil dev)`,
  nativeCurrency,
  rpcUrls: {
    default: { http: [ANVIL_RPC_URL] },
  },
});
