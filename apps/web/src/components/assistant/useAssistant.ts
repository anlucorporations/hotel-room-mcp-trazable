"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, PreparedPurchase } from "@/lib/assistant/types";

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
}

/**
 * Estado de la conversación con el asistente (CU-08). Habla con `/api/assistant` server-side.
 * `walletAddress` (la cuenta conectada, opcional) se envía como contexto para que el asistente
 * pueda, por ejemplo, consultar las noches del usuario sin pedirle la dirección.
 *
 * `errorReply` es el texto neutro que se INYECTA en el log como mensaje del asistente cuando una
 * petición falla (MINOR#33): mantiene la traza histórica además del banner. Lo aporta el llamante
 * para no acoplar i18n al hook.
 */
export function useAssistant(walletAddress: string | undefined, errorReply: string): UseAssistantResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const [preparedPurchase, setPreparedPurchase] = useState<PreparedPurchase | null>(null);
  // Última conversación enviada con éxito de envío (no necesariamente de respuesta): base del reintento.
  const lastConversation = useRef<ChatMessage[] | null>(null);

  // Núcleo del envío: dada una conversación COMPLETA (ya incluye el turno de usuario), la manda.
  const dispatch = useCallback(
    async (conversation: ChatMessage[]): Promise<void> => {
      lastConversation.current = conversation;
      setMessages(conversation);
      setStatus("loading");
      setUnavailable(false); // se está (re)intentando: oculta el aviso previo mientras carga.
      setPreparedPurchase(null);

      const fail = (): void => {
        setUnavailable(true);
        setStatus("error");
        // Traza histórica del fallo en el propio log, además del banner (MINOR#33).
        setMessages((current) => [...current, { role: "assistant", text: errorReply }]);
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
        setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
        setPreparedPurchase(data.preparedPurchase ?? null);
        setStatus("idle");
      } catch {
        fail();
      }
    },
    [walletAddress, errorReply],
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
