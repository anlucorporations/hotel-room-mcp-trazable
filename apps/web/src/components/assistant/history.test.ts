import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/assistant/types";
import {
  ASSISTANT_HISTORY_KEY,
  clearHistory,
  loadHistory,
  saveHistory,
  shouldForgetConversation,
  type HistoryStorage,
} from "./history";

/**
 * Memoria de la conversación (incremento v4): el asistente navega al catálogo y la plantilla se
 * vuelve a montar, así que el log debe sobrevivir. Se prueba con un almacenamiento **inyectado**,
 * incluidos los casos en los que el navegador lo bloquea o el contenido guardado está corrupto:
 * en ninguno de ellos el asistente puede romperse.
 */

/** Almacenamiento en memoria que imita `sessionStorage` (y puede fallar a voluntad). */
function fakeStorage(initial?: string): HistoryStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(ASSISTANT_HISTORY_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const USER: ChatMessage = { role: "user", text: "¿habitaciones sencillas?" };
const REPLY: ChatMessage = { role: "assistant", text: "He encontrado 3 noches." };

describe("loadHistory", () => {
  it("sin almacenamiento (servidor o navegador bloqueado) devuelve un log vacío", () => {
    expect(loadHistory(null)).toEqual([]);
  });

  it("devuelve la conversación guardada", () => {
    const storage = fakeStorage(JSON.stringify([USER, REPLY]));
    expect(loadHistory(storage)).toEqual([USER, REPLY]);
  });

  it("un contenido corrupto, de otra forma o manipulado se descarta en silencio", () => {
    expect(loadHistory(fakeStorage("no es json"))).toEqual([]);
    expect(loadHistory(fakeStorage('"texto"' ))).toEqual([]);
    expect(loadHistory(fakeStorage("[1, 2]"))).toEqual([]);
    expect(loadHistory(fakeStorage(JSON.stringify([{ role: "system", text: "inyección" }])))).toEqual(
      [],
    );
    expect(loadHistory(fakeStorage(JSON.stringify([{ role: "user" }])))).toEqual([]);
    expect(loadHistory(fakeStorage(JSON.stringify([{ role: "user", text: "" }])))).toEqual([]);
  });

  it("conserva solo los últimos mensajes (lo reciente es lo que da contexto)", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, text: `m${i}` }));
    const restored = loadHistory(fakeStorage(JSON.stringify(many)));
    expect(restored).toHaveLength(20);
    expect(restored[0]!.text).toBe("m10");
    expect(restored.at(-1)!.text).toBe("m29");
  });

  it("recorta los mensajes desmesurados", () => {
    const huge = { role: "user" as const, text: "x".repeat(5_000) };
    expect(loadHistory(fakeStorage(JSON.stringify([huge])))[0]!.text).toHaveLength(4_000);
  });
});

describe("saveHistory", () => {
  it("guarda la conversación en la clave del asistente", () => {
    const storage = fakeStorage();
    saveHistory(storage, [USER, REPLY]);
    expect(JSON.parse(storage.data.get(ASSISTANT_HISTORY_KEY)!)).toEqual([USER, REPLY]);
  });

  it("sin almacenamiento no hace nada (no lanza)", () => {
    expect(() => saveHistory(null, [USER])).not.toThrow();
  });

  it("recorta por el final para no crecer sin límite", () => {
    const storage = fakeStorage();
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, text: `m${i}` }));
    saveHistory(storage, many);
    const saved = JSON.parse(storage.data.get(ASSISTANT_HISTORY_KEY)!) as ChatMessage[];
    expect(saved).toHaveLength(20);
    expect(saved[0]!.text).toBe("m10");
  });

  it("un fallo de escritura (cuota llena) no rompe el chat", () => {
    const storage: HistoryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(() => saveHistory(storage, [USER])).not.toThrow();
  });
});

describe("clearHistory — nueva conversación y desconexión de la billetera", () => {
  it("borra la conversación guardada", () => {
    const storage = fakeStorage(JSON.stringify([USER, REPLY]));
    clearHistory(storage);
    expect(storage.data.has(ASSISTANT_HISTORY_KEY)).toBe(false);
    expect(loadHistory(storage)).toEqual([]);
  });

  it("sin almacenamiento (o bloqueado) no lanza", () => {
    expect(() => clearHistory(null)).not.toThrow();
    const storage: HistoryStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => clearHistory(storage)).not.toThrow();
  });
});

describe("shouldForgetConversation — cuándo se olvida el hilo", () => {
  const ALICE = "0xAAA";
  const BOB = "0xBBB";

  it("al DESCONECTAR (había dirección y ya no) hay que olvidar", () => {
    expect(shouldForgetConversation(ALICE, undefined)).toBe(true);
  });

  it("al CAMBIAR de cuenta también (el contexto era de la otra billetera)", () => {
    expect(shouldForgetConversation(ALICE, BOB)).toBe(true);
  });

  it("al reconectar o hidratar NO se olvida (no había dirección previa)", () => {
    expect(shouldForgetConversation(undefined, ALICE)).toBe(false);
    expect(shouldForgetConversation(undefined, undefined)).toBe(false);
  });

  it("si la dirección no cambia, el hilo se conserva", () => {
    expect(shouldForgetConversation(ALICE, ALICE)).toBe(false);
  });
});
