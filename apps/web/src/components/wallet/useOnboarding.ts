"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { activeChain } from "@/config/chain";
import { classifySwitchChainError, type SwitchChainError } from "./switchChainError";
import { ensureWalletChain, type Eip1193Provider } from "@/lib/wallet-chain";
import { pickPreferredConnector } from "@/lib/wallet-connectors";

export type { SwitchChainError };

export interface OnboardingState {
  readonly hasWallet: boolean;
  readonly isConnected: boolean;
  readonly address?: `0x${string}`;
  readonly isWrongNetwork: boolean;
  readonly isConnecting: boolean;
  readonly canPurchase: boolean;
  /** Estado del último intento de cambio de red (RF-04); `null` si no hubo fallo. */
  readonly switchError: SwitchChainError | null;
  readonly isSwitchingNetwork: boolean;
  /** Conecta con una billetera concreta (EIP-6963); sin argumento, la preferida. */
  connect: (connectorId?: string) => void;
  switchToAppChain: () => void;
  /** Desconecta la wallet del sitio (acción del menú de cabecera, RF-40.2). */
  disconnect: () => void;
}

/** Estado de onboarding web3 (CU-17, docs/SRS.md §9, RF-04): wallet, conexión, red correcta y cambio de red. */
export function useOnboarding(): OnboardingState {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connect, isPending } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const queryClient = useQueryClient();

  const [hasWallet, setHasWallet] = useState(true);
  const [switchError, setSwitchError] = useState<SwitchChainError | null>(null);
  // `mounted` evita el mismatch de hidratación: el SERVIDOR siempre renderiza «desconectado»
  // (no conoce la wallet), así que hasta que monta el cliente devolvemos ese MISMO estado. Sin
  // esto, una wallet ya conectada (MetaMask) hace que el primer render cliente difiera del HTML
  // del servidor → React descarta y re-renderiza el árbol (destellos), y se repite en cada
  // `router.refresh()` de la compra. Tras montar, exponemos el estado real (CU-17, RNF-19/20).
  // **Limpieza de estado entre carteras**: si cambia la cuenta o la red, se invalidan las consultas
  // (saldo, noches, catálogo…) para no mezclar datos de dos billeteras en la misma sesión.
  const identityRef = useRef<string>("");
  useEffect(() => {
    const identity = `${address ?? ""}:${chainId ?? ""}`;
    if (identityRef.current && identityRef.current !== identity) {
      void queryClient.invalidateQueries();
    }
    identityRef.current = identity;
  }, [address, chainId, queryClient]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const provider = (window as unknown as { ethereum?: unknown }).ethereum;
    setHasWallet(Boolean(provider));
  }, []);

  // Valores estabilizados para SSR: antes de montar, todo «desconectado» (igual que el servidor).
  const connected = mounted ? isConnected : false;
  const isWrongNetwork = connected && chainId !== activeChain.id;

  // Hay cartera si la inyecta `window.ethereum` **o** si el descubrimiento EIP-6963 encontró alguna:
  // una cartera que solo se anuncia (sin ocupar `window.ethereum`) también debe contar, o los
  // botones de compra quedarían deshabilitados con la cartera instalada.
  const walletAvailable = hasWallet || connectors.length > 0;

  return {
    hasWallet: mounted ? walletAvailable : true,
    isConnected: connected,
    address: mounted ? address : undefined,
    isWrongNetwork,
    isConnecting: mounted ? isPending : false,
    canPurchase: connected && !isWrongNetwork,
    switchError,
    isSwitchingNetwork: mounted ? isSwitching : false,
    // Se usa el conector **ya configurado** (no un `injected()` nuevo por clic): con EIP-6963 la
    // lista incluye todas las carteras instaladas, así que sirve cualquiera; y reutilizar el conector
    // evita pedir permisos repetidos a MetaMask en cada intento.
    connect: (connectorId?: string) => {
      // Un solo aviso: se reutiliza el conector ya configurado (no se instancia un `injected()`
      // nuevo por clic, que repetía la petición de permisos) y, con EIP-6963, cualquier billetera
      // descubierta sirve. Sin `connectorId` se prefiere MetaMask (por id/rdns/nombre) y, si no
      // está, el `injected` de respaldo y, en último término, el primero de la lista.
      const selected = connectorId
        ? connectors.find((candidate) => candidate.id === connectorId)
        : pickPreferredConnector(connectors);
      if (selected) connect({ connector: selected });
    },
    // Cambio de red con **alta automática**: si la billetera no conoce la cadena (MetaMask devuelve
    // 4902, porque 31337 no está en su catálogo), `ensureWalletChain` la añade con los parámetros de
    // `activeChain` y reintenta el cambio; el usuario ve un solo diálogo por red nueva.
    switchToAppChain: () => {
      setSwitchError(null);
      void (async () => {
        try {
          const provider = (await connector?.getProvider()) as unknown as Eip1193Provider | undefined;
          if (!provider) {
            switchChain(
              { chainId: activeChain.id },
              { onError: (error) => setSwitchError(classifySwitchChainError(error)) },
            );
            return;
          }
          const result = await ensureWalletChain(provider, activeChain);
          if (result === "rejected") setSwitchError("rejected");
          else if (result === "failed") setSwitchError("failed");
        } catch {
          setSwitchError("failed");
        }
      })();
    },
    disconnect: () => disconnect(),
  };
}
