"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoleName } from "@hotel/shared/domain";
import { roleSatisfies } from "@/lib/admin-roles";
import { useOnboarding } from "@/components/wallet/useOnboarding";

/**
 * Motivo por el que el último intento de acceso no concedió sesión.
 * `null` = sin error.
 */
export type AdminAuthError =
  | "invalidCredentials"
  | "mfaInvalid"
  | "locked"
  | "rateLimited"
  | "expired"
  | "failed"
  | null;

export type AdminAuthStep = "credentials" | "mfa";

export interface AdminSession {
  /** Onboarding de wallet (conexión/red), reexpuesto para que el layout no lo duplique. */
  readonly onboarding: ReturnType<typeof useOnboarding>;
  /** Usuario con sesión activa, o `null` si no hay sesión. */
  readonly sessionUsername: string | null;
  /** Roles de la sesión (D-04: `DEFAULT_ADMIN_ROLE` o `RECEPTION_ROLE`); `[]` sin sesión. */
  readonly roles: readonly RoleName[];
  /**
   * `true` si la sesión es el owner (`DEFAULT_ADMIN_ROLE`, D-30). El owner gobierna todos los
   * paneles; los roles operativos solo el suyo. La autoridad última sigue siendo el contrato.
   */
  readonly isOwner: boolean;
  /** `true` mientras se resuelve el estado inicial de sesión (`/api/auth/session`). */
  readonly isLoading: boolean;
  /** `true` mientras se validan credenciales o el segundo factor. */
  readonly isSigningIn: boolean;
  readonly authStep: AdminAuthStep;
  readonly authError: AdminAuthError;
  readonly recoveryRemaining: number | null;
  /** ¿La sesión incluye el rol indicado? (gating de UI, no de seguridad). */
  hasRole: (role: RoleName) => boolean;
  /**
   * Envía usuario + contraseña. Si el reto MFA avanza, `authStep` pasa a `"mfa"` y hay que
   * llamar a `verifyMfa` con el código TOTP o un código de rescate.
   */
  submitCredentials: (username: string, password: string) => Promise<void>;
  /** Envía el segundo factor y, si es correcto, deja la sesión activa. */
  verifyMfa: (params: { totpCode?: string; recoveryCode?: string }) => Promise<void>;
  /** Cierra la sesión en el servidor (blocklist + borrado de cookies). */
  signOut: () => Promise<void>;
  /** Vuelve al paso de credenciales (p. ej. tras un error de MFA). */
  resetAuth: () => void;
  /**
   * `fetch` autenticado por cookie HttpOnly con renovación automática: ante un 401 intenta
   * `/api/auth/refresh` (rotación de refresh) y repite la petición una vez.
   */
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

interface SessionResponse {
  readonly authenticated?: boolean;
  readonly username?: string | null;
  readonly roles?: RoleName[];
  readonly recoveryRemaining?: number | null;
}

// Los tokens viven SOLO en cookies HttpOnly puestas por el servidor: nunca se guardan en
// localStorage ni se exponen a JavaScript (defensa XSS). El cliente no los toca en ningún caso.
const JSON_HEADERS = { "content-type": "application/json" } as const;

/** ¿La petición de sesión se resolvió con un usuario? (normaliza respuesta y errores). */
function usernameOf(data: SessionResponse): string | null {
  return data.authenticated && typeof data.username === "string" ? data.username : null;
}

/**
 * Sesión del back-office (D-04): contraseña + TOTP obligatorio.
 *
 * Sustituye al login SIWE de la UI. El estado de sesión se resuelve contra `/api/auth/session`
 * y las credenciales contra `/api/auth/login` y `/api/auth/mfa/verify`. Los tokens quedan en
 * cookies HttpOnly; `apiFetch` renueva el access token sin que el componente lo gestione.
 *
 * La wallet se sigue usando para FIRMAR las transacciones del back-office (minteo, pausas,
 * roles), pero ya no autentica.
 */
export function useAdminSession(): AdminSession {
  const onboarding = useOnboarding();

  const [sessionUsername, setSessionUsername] = useState<string | null>(null);
  const [roles, setRoles] = useState<readonly RoleName[]>([]);
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authStep, setAuthStep] = useState<AdminAuthStep>("credentials");
  const [authError, setAuthError] = useState<AdminAuthError>(null);
  const challengeToken = useRef<string | null>(null);

  const applySession = useCallback((data: SessionResponse) => {
    setSessionUsername(usernameOf(data));
    setRoles(data.roles ?? []);
    setRecoveryRemaining(data.recoveryRemaining ?? null);
  }, []);

  const loadSession = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const data = (await res.json()) as SessionResponse;
    // Sin token válido la ruta responde 401: se limpia el estado local en lugar de mostrar una
    // sesión fantasma.
    applySession(res.ok ? data : { authenticated: false });
    return res.ok && usernameOf(data) !== null;
  }, [applySession]);

  // Arranque: si el access token caducó pero el refresh sigue vivo, se renueva y se reintenta
  // antes de dar la sesión por cerrada (el operador no ve un cierre de sesión espurio).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const authenticated = await loadSession();
        if (!active) return;
        if (!authenticated) {
          const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
          if (active && refreshed.ok) await loadSession();
        }
      } catch {
        if (active) {
          setSessionUsername(null);
          setRoles([]);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadSession]);

  const apiFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      if (response.status !== 401) return response;

      const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
      if (!refreshed.ok) {
        setAuthError("expired");
        setSessionUsername(null);
        return response;
      }
      return fetch(input, init);
    },
    [],
  );

  const submitCredentials = useCallback(async (username: string, password: string) => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sessionToken?: string;
        error?: string;
      };

      if (res.status === 429) {
        setAuthError("rateLimited");
        return;
      }
      if (res.status === 423) {
        setAuthError("locked");
        return;
      }
      if (!res.ok || !data.sessionToken) {
        setAuthError(res.status === 401 ? "invalidCredentials" : "failed");
        return;
      }

      challengeToken.current = data.sessionToken;
      setAuthStep("mfa");
    } catch {
      setAuthError("failed");
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const verifyMfa = useCallback(
    async (params: { totpCode?: string; recoveryCode?: string }) => {
      setAuthError(null);
      const token = challengeToken.current;
      if (!token) {
        setAuthError("expired");
        setAuthStep("credentials");
        return;
      }

      setIsSigningIn(true);
      try {
        const res = await fetch("/api/auth/mfa/verify", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ sessionToken: token, ...params }),
        });

        if (res.status === 429) {
          setAuthError("rateLimited");
          return;
        }
        if (res.status === 423) {
          setAuthError("locked");
          return;
        }
        if (res.status === 401) {
          setAuthError("mfaInvalid");
          return;
        }
        if (!res.ok) {
          setAuthError("failed");
          return;
        }

        challengeToken.current = null;
        setAuthStep("credentials");
        await loadSession();
      } catch {
        setAuthError("failed");
      } finally {
        setIsSigningIn(false);
      }
    },
    [loadSession],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      challengeToken.current = null;
      setSessionUsername(null);
      setRoles([]);
      setRecoveryRemaining(null);
      setAuthStep("credentials");
      setAuthError(null);
    }
  }, []);

  const resetAuth = useCallback(() => {
    challengeToken.current = null;
    setAuthStep("credentials");
    setAuthError(null);
  }, []);

  const hasRole = useCallback((role: RoleName) => roleSatisfies(roles, role), [roles]);

  return {
    onboarding,
    sessionUsername,
    roles,
    isOwner: roles.includes("DEFAULT_ADMIN_ROLE"),
    isLoading,
    isSigningIn,
    authStep,
    authError,
    recoveryRemaining,
    hasRole,
    submitCredentials,
    verifyMfa,
    signOut,
    resetAuth,
    apiFetch,
  };
}
