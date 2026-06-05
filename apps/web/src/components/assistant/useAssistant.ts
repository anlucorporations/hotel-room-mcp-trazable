"use client";

import { useCallback, useState } from "react";
import type { ChatMessage, PreparedPurchase } from "@/lib/assistant/types";

export type AssistantStatus = "idle" | "loading" | "error";

export interface UseAssistantResult {
  readonly messages: readonly ChatMessage[];
  readonly status: AssistantStatus;
  /** El backend del asistente no está disponible (sin clave, MCP/RPC caídos) → 08e. */
  readonly unavailable: boolean;
  readonly preparedPurchase: PreparedPurchase | null;
  send: (text: string) => Promise<void>;
}

interface AssistantApiResponse {
  readonly reply: string;
  readonly preparedPurchase: PreparedPurchase | null;
}

/** Estado de la conversación con el asistente (CU-08). Habla con `/api/assistant` server-side. */
export function useAssistant(): UseAssistantResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const [preparedPurchase, setPreparedPurchase] = useState<PreparedPurchase | null>(null);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || status === "loading") return;

      const conversation: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
      setMessages(conversation);
      setStatus("loading");
      setUnavailable(false); // se está reintentando: oculta el aviso previo mientras carga.
      setPreparedPurchase(null);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: conversation }),
        });
        if (!res.ok) {
          setUnavailable(true);
          setStatus("error");
          return;
        }
        const data = (await res.json()) as AssistantApiResponse;
        setUnavailable(false);
        setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
        setPreparedPurchase(data.preparedPurchase ?? null);
        setStatus("idle");
      } catch {
        setUnavailable(true);
        setStatus("error");
      }
    },
    [messages, status],
  );

  return { messages, status, unavailable, preparedPurchase, send };
}
