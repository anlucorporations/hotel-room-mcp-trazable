"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "@/config/chain";
import { classifySwitchChainError, type SwitchChainError } from "./switchChainError";

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
  connect: () => void;
  switchToAppChain: () => void;
  /** Desconecta la wallet del sitio (acción del menú de cabecera, RF-40.2). */
  disconnect: () => void;
}

/** Estado de onboarding web3 (CU-17, docs/SRS.md §9, RF-04): wallet, conexión, red correcta y cambio de red. */
export function useOnboarding(): OnboardingState {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [hasWallet, setHasWallet] = useState(true);
  const [switchError, setSwitchError] = useState<SwitchChainError | null>(null);
  // `mounted` evita el mismatch de hidratación: el SERVIDOR siempre renderiza «desconectado»
  // (no conoce la wallet), así que hasta que monta el cliente devolvemos ese MISMO estado. Sin
  // esto, una wallet ya conectada (MetaMask) hace que el primer render cliente difiera del HTML
  // del servidor → React descarta y re-renderiza el árbol (destellos), y se repite en cada
  // `router.refresh()` de la compra. Tras montar, exponemos el estado real (CU-17, RNF-19/20).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const provider = (window as unknown as { ethereum?: unknown }).ethereum;
    setHasWallet(Boolean(provider));
  }, []);

  // Valores estabilizados para SSR: antes de montar, todo «desconectado» (igual que el servidor).
  const connected = mounted ? isConnected : false;
  const isWrongNetwork = connected && chainId !== activeChain.id;

  return {
    hasWallet: mounted ? hasWallet : true,
    isConnected: connected,
    address: mounted ? address : undefined,
    isWrongNetwork,
    isConnecting: mounted ? isPending : false,
    canPurchase: connected && !isWrongNetwork,
    switchError,
    isSwitchingNetwork: mounted ? isSwitching : false,
    connect: () => connect({ connector: injected() }),
    // Capturamos el error de cambio de red (4902 incl.) para guiar al usuario sin romper.
    switchToAppChain: () => {
      setSwitchError(null);
      switchChain(
        { chainId: activeChain.id },
        { onError: (error) => setSwitchError(classifySwitchChainError(error)) },
      );
    },
    disconnect: () => disconnect(),
  };
}
