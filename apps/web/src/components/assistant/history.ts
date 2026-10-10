import type { ChatMessage } from "@/lib/assistant/types";

/**
 * Memoria de la conversación del asistente (incremento v4).
 *
 * El asistente ahora es global y **navega** a la página del catálogo para enseñar el resultado de
 * una consulta. Al cambiar de ruta, la plantilla que aloja el chat se vuelve a montar, así que sin
 * memoria el usuario aterrizaría en el catálogo con la conversación en blanco. Este módulo la
 * conserva en `sessionStorage` (por pestaña: no se comparte entre usuarios ni sobrevive al cierre).
 *
 * Es deliberadamente puro y con el almacenamiento **inyectado**: se prueba sin navegador y el
 * asistente sigue funcionando —sin memoria— cuando el navegador la bloquea (modo privado, cookies
 * de terceros desactivadas).
 */

/** Clave de la pestaña; lleva prefijo del proyecto para no chocar con nada más. */
export const ASSISTANT_HISTORY_KEY = "hotel.assistant.history";

/**
 * Tope de mensajes guardados. El histórico es solo contexto de continuidad: la API ya recorta la
 * conversación a 40 mensajes y a un presupuesto de tokens, así que no tiene sentido (ni es barato)
 * conservar más de lo que se puede enviar.
 */
const MAX_PERSISTED_MESSAGES = 20;
/** Tope por mensaje: mismo recorte que aplica la API al recibir (evita reventar la cuota). */
const MAX_MESSAGE_LENGTH = 4_000;

/** Subconjunto del `Storage` del navegador que necesita el asistente. */
export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `sessionStorage` del navegador, o `null` si no está disponible (render en servidor, pruebas,
 * Safari en modo privado o almacenamiento bloqueado por política).
 */
export function browserHistoryStorage(): HistoryStorage | null {
  try {
    const storage = globalThis.sessionStorage as HistoryStorage | undefined;
    return storage ? storage : null;
  } catch {
    // El propio acceso a `sessionStorage` puede lanzar (política del navegador): sin memoria, y ya.
    return null;
  }
}

/** `true` si el valor es un mensaje del asistente con forma válida. */
function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { role?: unknown; text?: unknown };
  const roleOk = candidate.role === "user" || candidate.role === "assistant";
  return roleOk && typeof candidate.text === "string" && candidate.text.length > 0;
}

/**
 * Lee la conversación guardada. **Nunca lanza**: cualquier contenido corrupto, de otra versión o
 * manipulado se descarta en silencio y el asistente arranca limpio.
 */
export function loadHistory(storage: HistoryStorage | null): ChatMessage[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(ASSISTANT_HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isChatMessage)
      .slice(-MAX_PERSISTED_MESSAGES)
      .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_MESSAGE_LENGTH) }));
  } catch {
    return [];
  }
}

/**
 * Guarda la conversación (recortada por el final: lo reciente es lo que da contexto). Un fallo de
 * escritura —cuota llena, almacenamiento bloqueado— tampoco debe romper el chat.
 */
export function saveHistory(
  storage: HistoryStorage | null,
  messages: readonly ChatMessage[],
): void {
  if (storage === null) return;
  try {
    const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES).map((m) => ({
      role: m.role,
      text: m.text.slice(0, MAX_MESSAGE_LENGTH),
    }));
    storage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Sin memoria: la conversación sigue viva en pantalla.
  }
}

/**
 * **Borra** la conversación guardada (petición del responsable, 2026-10-10): el botón «nueva
 * conversación» y la desconexión de la billetera deben dejar la pestaña limpia, sin el hilo anterior.
 * Un fallo del almacenamiento no rompe nada: sin memoria, el asistente sigue funcionando.
 */
export function clearHistory(storage: HistoryStorage | null): void {
  if (storage === null) return;
  try {
    storage.removeItem(ASSISTANT_HISTORY_KEY);
  } catch {
    // Almacenamiento bloqueado: no hay nada que borrar.
  }
}

/**
 * ¿Hay que **olvidar** la conversación al cambiar la billetera conectada?
 *
 * Sí al **desconectar** (dirección → `undefined`) y al **cambiar de cuenta** (una dirección por
 * otra): el contexto que se le dio al asistente era de la billetera anterior —«tus noches»,
 * `getOwnedNights`— y no debe sobrevivirle (privacidad, y evita mezclar dos carteras en el mismo
 * hilo). **No** al reconectar ni al hidratar: si no había dirección previa (primer render, la cartera
 * aún reconectando), no hay nada que olvidar.
 */
export function shouldForgetConversation(
  previous: string | undefined,
  next: string | undefined,
): boolean {
  return previous !== undefined && next !== previous;
}
