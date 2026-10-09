"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, PreparedPurchase } from "@/lib/assistant/types";
import type { AssistantPageAction } from "@/lib/assistant/page-action";
import { browserHistoryStorage, loadHistory, saveHistory } from "./history";

export type AssistantStatus = "idle" | "loading" | "error";

export interface UseAssistantResult {
  readonly messages: readonly ChatMessage[];
  readonly status: AssistantStatus;
  /** El backend del asistente no está disponible (sin clave, MCP/RPC caídos) → 08e. */
  readonly unavailable: boolean;
  /** `true` si hay un último turno de usuario que se puede reenviar (MINOR#27). */
  readonly canRetry: boolean;
  readonly preparedPurchase: PreparedPurchase | null;
  send: (text: string) => Promise<void>;
  /** Reenvía el último turno de usuario sin reescribir el input (MINOR#27). */
  retry: () => Promise<void>;
}

interface AssistantApiResponse {
  readonly reply: string;
  readonly preparedPurchase: PreparedPurchase | null;
  /** Navegación que muestra el resultado de la consulta en la página (incremento v4). */
  readonly pageAction?: AssistantPageAction | null;
}

/**
 * Estado de la conversación con el asistente (CU-08, docs/SRS.md §9). Habla con `/api/assistant` server-side.
 * `walletAddress` (la cuenta conectada, opcional) se envía como contexto para que el asistente
 * pueda, por ejemplo, consultar las noches del usuario sin pedirle la dirección.
 *
 * `errorReply` es el texto neutro que se INYECTA en el log como mensaje del asistente cuando una
 * petición falla (MINOR#33): mantiene la traza histórica además del banner. Lo aporta el llamante
 * para no acoplar i18n al hook.
 *
 * `onPageAction` (incremento v4) se invoca cuando el turno consultó el catálogo: quien monta el
 * hook decide cómo llevarlo a la página (el widget navega y cierra el panel; la página completa
 * navega igual). La conversación se conserva en `sessionStorage`, así que el salto no la pierde.
 */
export function useAssistant(
  walletAddress: string | undefined,
  errorReply: string,
  onPageAction?: (action: AssistantPageAction) => void,
): UseAssistantResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const [preparedPurchase, setPreparedPurchase] = useState<PreparedPurchase | null>(null);
  // Almacenamiento de la pestaña, resuelto una sola vez (puede ser `null`: sin memoria y ya).
  const storageRef = useRef<ReturnType<typeof browserHistoryStorage>>(null);
  // Última conversación enviada con éxito de envío (no necesariamente de respuesta): base del reintento.
  const lastConversation = useRef<ChatMessage[] | null>(null);

  // Restauración diferida: en el primer render (servidor y cliente) el log va vacío, así que no hay
  // desajuste de hidratación; la conversación guardada aparece al montar.
  useEffect(() => {
    storageRef.current = browserHistoryStorage();
    const restored = loadHistory(storageRef.current);
    if (restored.length > 0) setMessages(restored);
  }, []);

  /**
   * Persiste el log **en el momento**, no por efecto.
   *
   * No es un detalle: cuando el asistente navega (acción de página), el widget cierra el panel en el
   * MISMO ciclo en que llega la respuesta, así que el componente se desmonta antes de que corra el
   * efecto de guardado y la conversación se perdía (reproducido en E2E: al reabrir el panel en el
   * catálogo, el hilo estaba vacío). Guardar aquí hace que la continuidad no dependa del orden de
   * los efectos de React.
   */
  const persist = useCallback((conversation: ChatMessage[]): void => {
    saveHistory(storageRef.current, conversation);
  }, []);

  // Núcleo del envío: dada una conversación COMPLETA (ya incluye el turno de usuario), la manda.
  const dispatch = useCallback(
    async (conversation: ChatMessage[]): Promise<void> => {
      lastConversation.current = conversation;
      setMessages(conversation);
      persist(conversation);
      setStatus("loading");
      setUnavailable(false); // se está (re)intentando: oculta el aviso previo mientras carga.
      setPreparedPurchase(null);

      const fail = (): void => {
        setUnavailable(true);
        setStatus("error");
        // Traza histórica del fallo en el propio log, además del banner (MINOR#33).
        const failed: ChatMessage[] = [...conversation, { role: "assistant", text: errorReply }];
        setMessages(failed);
        persist(failed);
      };

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: conversation, walletAddress }),
        });
        if (!res.ok) return fail();
        const data = (await res.json()) as AssistantApiResponse;
        setUnavailable(false);
        const answered: ChatMessage[] = [...conversation, { role: "assistant", text: data.reply }];
        setMessages(answered);
        persist(answered);
        setPreparedPurchase(data.preparedPurchase ?? null);
        setStatus("idle");
        // La consulta se materializa en la página (catálogo filtrado): se avisa al llamante.
        if (data.pageAction) onPageAction?.(data.pageAction);
      } catch {
        fail();
      }
    },
    [walletAddress, errorReply, onPageAction, persist],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || status === "loading") return;
      await dispatch([...messages, { role: "user", text: trimmed }]);
    },
    [dispatch, messages, status],
  );

  // Reenvía la última conversación: reutiliza el turno de usuario sin reescribir el input (MINOR#27).
  const retry = useCallback(async (): Promise<void> => {
    const last = lastConversation.current;
    if (!last || status === "loading") return;
    await dispatch(last);
  }, [dispatch, status]);

  return {
    messages,
    status,
    unavailable,
    canRetry: status === "error" && lastConversation.current !== null,
    preparedPurchase,
    send,
    retry,
  };
}
