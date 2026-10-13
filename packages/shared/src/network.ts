import { defineChain } from "viem";
import {
  ANVIL_RPC_URL,
  BESU_RPC_URL,
  CHAIN_ID,
  CURRENCY_DECIMALS,
  CURRENCY_SYMBOL,
  NETWORK_NAME,
} from "./constants";

/**
 * Configuración de red para viem/wagmi (ADR-17).
 *
 * La red del proyecto es **Besu** (testnet de Codecrypto, `chainId 81234`); **Anvil** solo se usa
 * como espejo local de desarrollo/CI con el mismo `chainId`. El código elige una u otra por la URL
 * del RPC (localhost ⇒ Anvil), no por el `chainId`, que es compartido.
 *
 * `baseFee = 0` en Besu ⇒ los consumidores deben construir transacciones con fees
 * explícitos (`FEE_MODE`); no usar la auto-estimación EIP-1559.
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
  rpcUrls: {
    default: { http: [BESU_RPC_URL] },
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
