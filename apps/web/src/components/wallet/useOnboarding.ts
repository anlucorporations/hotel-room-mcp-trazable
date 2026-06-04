"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "@/config/chain";

export interface OnboardingState {
  readonly hasWallet: boolean;
  readonly isConnected: boolean;
  readonly address?: `0x${string}`;
  readonly isWrongNetwork: boolean;
  readonly isConnecting: boolean;
  readonly canPurchase: boolean;
  connect: () => void;
  switchToAppChain: () => void;
}

/** Estado de onboarding web3 (CU-17): detección de wallet, conexión y red correcta. */
export function useOnboarding(): OnboardingState {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, isPending } = useConnect();
  const { switchChain } = useSwitchChain();

  const [hasWallet, setHasWallet] = useState(true);
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
    connect: () => connect({ connector: injected() }),
    switchToAppChain: () => switchChain({ chainId: activeChain.id }),
  };
}
