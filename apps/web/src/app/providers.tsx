"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { activeChain, rpcUrl } from "@/config/chain";
import { buildWalletConnectors } from "@/lib/wallet-connectors";

const wagmiConfig = createConfig({
  chains: [activeChain],
  // **Cualquier cartera**, no solo la que ocupe `window.ethereum`:
  //   · `multiInjectedProviderDiscovery` (EIP-6963) hace que wagmi descubra TODAS las carteras
  //     inyectadas instaladas (MetaMask, Rabby, Coinbase, Brave, Zerion…) y cada una aparezca como
  //     conector propio, con el nombre y el icono que anuncia; el `injected()` del plan queda como
  //     **respaldo** para navegadores sin anuncio EIP-6963.
  //   · El plan añade **Coinbase Wallet** siempre y **WalletConnect** solo si existe
  //     `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (ver `lib/wallet-connectors.ts`).
  connectors: buildWalletConnectors({ walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID }),
  multiInjectedProviderDiscovery: true,
  // Menos carga para la cartera y el RPC: `batch` agrupa las lecturas del mismo tick (multicall) y
  // `retryCount` evita que un fallo puntual se traduzca en un error visible al huésped.
  transports: { [activeChain.id]: http(rpcUrl, { batch: true, retryCount: 2 }) },
  // El sondeo por defecto (4 s) multiplica las peticiones a la cartera (MetaMask las reenvía al RPC):
  // con 12 s el saldo y la red siguen frescos sin castigar al proveedor.
  pollingInterval: 12_000,
  ssr: true,
});

/** Proveedores de cliente (wagmi + TanStack Query). El catálogo RSC vive fuera de aquí. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Sin refetch al recuperar el foco de la ventana. Por defecto TanStack reconsulta
            // CADA query obsoleta al re-enfocar; con las lecturas on-chain `staleTime:0` de las
            // 12 tarjetas (priceOf), el catálogo, el saldo y el faucet, eso disparaba una tormenta
            // de refetches en cada blur/focus del ratón → re-renders y PARPADEO (más visible en
            // Besu, ~40ms/lectura). El refresco real ocurre al montar y con `router.refresh()`.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
