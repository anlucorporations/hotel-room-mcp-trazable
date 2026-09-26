"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Suscripción Web Push del navegador (RF-37, incremento v2).
 *
 * El backend de push ya existía (`WebPushService` + `/api/push/subscribe`), pero **no había cliente**:
 * sin un service worker que se registre y se suscriba, ningún navegador recibía los avisos. Este hook
 * cierra ese hueco. Es anónimo (LSSI-CE art. 21): solo guarda el endpoint del navegador, ningún dato
 * personal, y el usuario puede darse de baja en cualquier momento.
 */

export type WebPushState = "unsupported" | "default" | "denied" | "subscribed";

/** Convierte la clave pública VAPID (base64url) al formato que espera `pushManager.subscribe`. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function useWebPush(): {
  state: WebPushState;
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<WebPushState>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setState("denied");
    }
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) setState("subscribed");
      } catch {
        // Sin registro previo: se queda en el estado por defecto.
      }
    })();
  }, []);

  const enable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("unsupported");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        throw new Error("denied");
      }

      const keyRes = await fetch("/api/push/vapid");
      const keyData = (await keyRes.json().catch(() => ({}))) as { publicKey?: string | null };
      if (!keyRes.ok || !keyData.publicKey) throw new Error("no-key");

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as BufferSource,
      });

      const json = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("subscribe-failed");
      setState("subscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("default");
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
}
