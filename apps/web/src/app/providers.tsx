"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain, rpcUrl } from "@/config/chain";

const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http(rpcUrl) },
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
