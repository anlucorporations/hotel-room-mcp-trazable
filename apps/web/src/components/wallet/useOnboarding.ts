"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
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
}

/** Estado de onboarding web3 (CU-17, RF-04): wallet, conexión, red correcta y cambio de red. */
export function useOnboarding(): OnboardingState {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [hasWallet, setHasWallet] = useState(true);
  const [switchError, setSwitchError] = useState<SwitchChainError | null>(null);
  useEffect(() => {
    const provider = (window as unknown as { ethereum?: unknown }).ethereum;
    setHasWallet(Boolean(provider));
  }, []);

  const isWrongNetwork = isConnected && chainId !== activeChain.id;

  return {
    hasWallet,
    isConnected,
    address,
    isWrongNetwork,
    isConnecting: isPending,
    canPurchase: isConnected && !isWrongNetwork,
    switchError,
    isSwitchingNetwork: isSwitching,
    connect: () => connect({ connector: injected() }),
    // Capturamos el error de cambio de red (4902 incl.) para guiar al usuario sin romper.
    switchToAppChain: () => {
      setSwitchError(null);
      switchChain(
        { chainId: activeChain.id },
        { onError: (error) => setSwitchError(classifySwitchChainError(error)) },
      );
    },
  };
}
