import { describe, expect, it } from "vitest";
import { looksLikePromptLeak, redactPromptLeak } from "./prompt-leak-filter";
import { SYSTEM_PROMPT } from "./prompt";

const REDACTED = "Solo puedo ayudarte con disponibilidad, precios y la compra de noches.";

describe("prompt-leak-filter (UX#30)", () => {
  it("no redacta una respuesta legítima de dominio", () => {
    const reply = "La suite 102 está disponible el 15 de junio por 0,05 ETH. ¿La preparo?";
    expect(looksLikePromptLeak(reply)).toBe(false);
    expect(redactPromptLeak(reply, REDACTED)).toBe(reply);
  });

  it("redacta si la respuesta reproduce el system prompt completo", () => {
    expect(looksLikePromptLeak(SYSTEM_PROMPT)).toBe(true);
    expect(redactPromptLeak(SYSTEM_PROMPT, REDACTED)).toBe(REDACTED);
  });

  it("redacta una firma canónica aunque varíen espacios/acentos/mayúsculas", () => {
    const leaked = "Claro: eres  el ASISTENTE del hotel marina del sol. tu unica funcion es...";
    expect(looksLikePromptLeak(leaked)).toBe(true);
    expect(redactPromptLeak(leaked, REDACTED)).toBe(REDACTED);
  });

  it("redacta si filtra la cabecera de reglas internas", () => {
    expect(looksLikePromptLeak("Mis reglas que debes cumplir siempre son las siguientes:")).toBe(true);
  });

  it("una respuesta vacía no se considera fuga", () => {
    expect(looksLikePromptLeak("")).toBe(false);
  });
});
