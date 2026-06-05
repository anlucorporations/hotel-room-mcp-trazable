"use client";

import { useCallback, useEffect, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useSignMessage } from "wagmi";
import type { RoleName } from "@hotel/shared";
import { activeChain } from "@/config/chain";
import { useOnboarding } from "@/components/wallet/useOnboarding";

/** Motivo por el que el último inicio de sesión SIWE no concedió sesión. */
export type AdminSignInError = "noRole" | "failed" | null;

export interface AdminSession {
  /** Onboarding de wallet (conexión/red), reexpuesto para que el layout no lo duplique. */
  readonly onboarding: ReturnType<typeof useOnboarding>;
  /** Dirección con sesión activa, o `null` si no hay sesión. */
  readonly sessionAddress: string | null;
  /** Roles on-chain de la sesión (instantánea CU-01); `[]` sin sesión. */
  readonly roles: readonly RoleName[];
  /** `true` mientras se resuelve el estado inicial de sesión (`/api/auth/session`). */
  readonly isLoading: boolean;
  /** `true` mientras se firma/verifica un reto SIWE. */
  readonly isSigningIn: boolean;
  readonly signInError: AdminSignInError;
  /** La cuenta activa de la wallet difiere de la autenticada (firmaría otra cuenta). */
  readonly accountMismatch: boolean;
  /** ¿La sesión incluye el rol indicado? (gating de UI, no de seguridad). */
  hasRole: (role: RoleName) => boolean;
  signIn: () => Promise<void>;
}

interface SessionResponse {
  readonly address: string | null;
  readonly roles?: RoleName[];
}

/**
 * Sesión del back-office SIWE multi-rol (CU-01), centralizada para todo el AdminLayout (DRY):
 * lee `/api/auth/session`, ejecuta el reto SIWE (nonce → firma → verify) y expone los roles
 * para habilitar/deshabilitar paneles. El binding de dominio/cadena/nonce/firma vive en el
 * endpoint `verify`; aquí solo se construye el mensaje EIP-4361.
 */
export function useAdminSession(): AdminSession {
  const onboarding = useOnboarding();
  const { address } = onboarding;
  const { signMessageAsync } = useSignMessage();

  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [roles, setRoles] = useState<readonly RoleName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<AdminSignInError>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session")
      .then((r) => r.json() as Promise<SessionResponse>)
      .then((data) => {
        if (!active) return;
        setSessionAddress(data.address);
        setRoles(data.roles ?? []);
      })
      .catch(() => {
        if (active) setSessionAddress(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setSignInError(null);
    if (!address) return;
    setIsSigningIn(true);
    try {
      const { nonce } = (await fetch("/api/auth/nonce").then((r) => r.json())) as { nonce: string };
      const message = createSiweMessage({
        address,
        chainId: activeChain.id,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Acceso al back-office del Hotel Marina del Sol.",
      });
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (res.ok) {
        const data = (await res.json()) as { address: string; roles: RoleName[] };
        setSessionAddress(data.address);
        setRoles(data.roles);
      } else if (res.status === 403) {
        setSignInError("noRole");
      } else {
        setSignInError("failed");
      }
    } catch {
      setSignInError("failed");
    } finally {
      setIsSigningIn(false);
    }
  }, [address, signMessageAsync]);

  const accountMismatch = Boolean(
    sessionAddress && address && address.toLowerCase() !== sessionAddress.toLowerCase(),
  );

  const hasRole = useCallback((role: RoleName) => roles.includes(role), [roles]);

  return {
    onboarding,
    sessionAddress,
    roles,
    isLoading,
    isSigningIn,
    signInError,
    accountMismatch,
    hasRole,
    signIn,
  };
}
