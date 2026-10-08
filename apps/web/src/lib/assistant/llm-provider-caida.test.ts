import { describe, expect, it, vi } from "vitest";

/**
 * La rama del `catch` al componer el proveedor: si el SDK de Vertex falla al construirse, el
 * asistente debe fallar EN CERRADO (503), no propagar un 500. Se dobla el módulo para forzarlo.
 */

const estado = vi.hoisted(() => ({ lanzar: "error" as "error" | "no-error" }));

vi.mock("@ai-sdk/google-vertex", () => ({
  createVertex: () => {
    if (estado.lanzar === "error") throw new Error("proveedor caído");
    throw "caída sin Error";
  },
}));

import { createLlmClient } from "./llm-provider";

describe("createLlmClient — el SDK de Vertex falla", () => {
  it("devuelve el motivo cuando se lanza un Error", async () => {
    estado.lanzar = "error";
    const resultado = await createLlmClient({ GOOGLE_CLOUD_PROJECT: "hotel-mcp" } as never);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.reason).toBe("proveedor caído");
  });

  it("también lo resuelve cuando lo lanzado no es un Error", async () => {
    estado.lanzar = "no-error";
    const resultado = await createLlmClient({ GOOGLE_CLOUD_PROJECT: "hotel-mcp" } as never);

    expect(resultado.ok).toBe(false);
  });
});
